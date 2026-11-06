# План: перенос авторизации из NatsDoll в Nataskium

Дата: 2026-11-05, ревизия 5 (учтены все отчёты reviewer в `.claude/reviews/natsdoll-auth-port.md`: перенос NatsDoll, проверка ревизий 2–4; раздел 11).
Статус: **утверждён пользователем 2026-11-05**, решения — в разделе 10а; реализация идёт по частям A–G.
Источник: `NatsDoll/apps/api/src/features/auth/**`, `shared/lib/{tokens,dummyHash,passwordBlocklist,config,zValidator}.ts`,
`shared/middleware/{requireAuth,requireAdmin,rateLimit}.ts`, `shared/infrastructure/cleanup.ts`, `tests/integration/authRefresh.int.test.ts`.
Цель: `apps/api` (Hono + Prisma 7 + модель `Teacher`), `packages/shared/schemas`, позже `apps/web` (`/auth/**`).

Шаги: **1** register / login / refresh / logout / me → **2** email-верификация (Resend) → **3** сброс и смена пароля →
**4** Google OAuth → **5** фронт `/auth/**` → **6** удаление аккаунта (GDPR).
С ревизии 3 учитель создаётся **только при подтверждении email** (1.2а), поэтому шаги 1 и 2 рекомендуется делать
вместе (вопрос 2).

**Единая схема путей (решение тимлида, вопрос 5 закрыт):** Hono всегда монтирует роутер на `/api/auth`, Caddy префикс `/api`
не срезает. В dev Nuxt проксирует `/api` на API (`nitro.devProxy`, 1.7а). Маршруты, `Path` cookie и `GOOGLE_REDIRECT_URI`
одинаковы в dev, тестах и production.
Каждый шаг — отдельный цикл tester → reviewer; перед шагом, который трогает 3+ файла, — предложить пользователю checkpoint-коммит.

Логику NatsDoll переносим (единый 401 + dummy-хэш, одинаковый ответ регистрации, анти-pre-account-hijacking, непрозрачный
refresh с HMAC, CAS-ротация, инвалидация сессий при смене пароля, лимит сессий, `algorithms: ['HS256']`, таймауты Resend/Google,
`escapeHtml` в письмах), но **не как есть**: reviewer дал вердикт BLOCKED для переноса без переделки.

---

## 0. Чем Nataskium отличается от NatsDoll (влияет на каждый файл)

| Тема | NatsDoll | Nataskium | Что делаем |
|---|---|---|---|
| Prisma | 6, `@prisma/client`, глобальный `prisma` | 7, генерируемый клиент `src/generated/prisma/client`, `@prisma/adapter-pg`, фабрика `createPrismaClient(databaseUrl)` | Prisma и её ошибки — **только в `infrastructure/`**. Клиент создаётся в `index.ts` из разобранного env и передаётся в `createApp` |
| Пользователь | `User`: `name`, `role`, `emailVerified: Boolean`, гости | `Teacher`: без `name` и `role`, `emailVerifiedAt: Timestamptz?`, CHECK-ограничения | Гостей, `createGuestUser`, `requireAdmin` и роли не переносим. Учитель создаётся только при подтверждении email (1.2а), `emailVerifiedAt: new Date()`; до этого — `PendingRegistration` |
| Роль | `role` в JWT, `requireAdmin` верит только JWT | ролей нет; суперадмин — потом | В JWT роли нет. Когда появится суперадмин — роль миграцией, проверка **в БД** в каждом use-case суперадмина, 2FA (`docs/architecture.md`, «Суперадмин») — вне шагов 1–6 |
| Валидация | `zod/v3` (3.25.76, high GHSA-mrhx-c7xc-m3w5), `@hono/zod-validator` + обёртка с `as never` | Zod 4.6.7, `emailSchema`/`passwordSchema` в shared, `readJsonBody` → `ValidationError` 400 | Тела разбираем **только `readJsonBody(c, schema)`**. `zValidator.ts`, `@hono/zod-validator`, `zod/v3` не переносим |
| Нормализация | email не приводится к нижнему регистру, пароль не NFC | `emailSchema` (trim, lowercase, punycode), `passwordSchema` (NFC) | `emailSchema` — **во всех точках входа** email (раздел 1.4) |
| Конфиг | `process.env.*` внутри функций, `secure` из сырого `NODE_ENV`, `FRONTEND_URL` по умолчанию localhost | `parseEnv` + Zod, сообщения без значений, `NODE_ENV` по умолчанию `production` | Все секреты и URL — в `env.ts`; значения передаются в фабрики через `app.ts`; `process.env` в фичах не читается |
| Ошибки | `AppError(statusCode)`, `onError` разбирает Prisma | `AppError(status)`, `errorHandler` логирует только тип + `routePath` | Use-case бросает `AppError`; репозиторий переводит P2002/P2025 в результат (`{ created: false }`, `false`) |
| Слои | роутер импортирует infrastructure (`getGoogleAuthUrl`) | `app.ts` — единственный composition root | Роутер получает **только функции** через объект зависимостей из `app.ts` |

---

## 1. Шаг 1 — register / login / refresh / logout / me (подробно)

### 1.1. Зависимости (перед установкой — проверка по CLAUDE.md и отчёт пользователю)

| Пакет | В NatsDoll | Актуальная (2026-11-05) | Advisories | Решение |
|---|---|---|---|---|
| `@node-rs/argon2` | 2.0.2 | 2.2.2 (2026-10-06) | нет | Брать 2.2.x. Нативный prebuilt (napi): проверить сборку под архитектуру Docker-образа (glibc/musl) |
| `jose` | 6.2.2 | 6.2.15 (2026-11-01) | нет | Брать 6.x явно в `apps/api` (транзитивно уже есть 6.2.13 через `@nuxt/eslint`) |
| `resend` | 6.12.4 | 6.37.0 | нет | Шаг 2; прочитать changelog за 25 минорных версий |
| `googleapis` | 171.4.0 | 189.0.0 | у пакета нет, дерево огромное | **Не брать** (шаг 4) |
| `@hono/zod-validator` | 0.7.6 | 0.9.1 | нет | **Не брать**: есть `readJsonBody` |
| `zod` | 3.25.76 | у нас 4.6.7 | high GHSA-mrhx-c7xc-m3w5 (<4.6.6) | У нас исправлено; подпуть `zod/v3` не использовать |
| `hono` | 4.12.27 | у нас 4.13.16 | 9 moderate в старой (вкл. ReDoS в CORS) | У нас с исправлениями |
| `@hono/node-server` | 1.19.13 | у нас 2.1.6 | 2 moderate в старой | В 2.1.6 экспорт `./conninfo` есть (проверено в `package.json`); поведение `getConnInfo` под 2.x покрыть тестом |

После установки — `npm audit` (high/critical блокируют).

### 1.2. Prisma: схема и миграции `refresh_tokens` и `pending_registrations`

Две миграции: `refresh_tokens` и `pending_registrations` (1.2а). Таблица сброса пароля — в шаге 3.

```prisma
model Teacher {
  // ...существующие поля
  refreshTokens RefreshToken[]
}

// Сырой токен — у клиента в cookie; в базе только HMAC-SHA256.
// Семья = все токены одного входа: ротация продолжает семью, вход начинает новую
model RefreshToken {
  id              String    @id @default(uuid()) @db.Uuid
  teacherId       String    @map("teacher_id") @db.Uuid
  familyId        String    @map("family_id") @db.Uuid
  familyExpiresAt DateTime  @map("family_expires_at") @db.Timestamptz
  tokenHash       String    @unique @map("token_hash")
  expiresAt       DateTime  @map("expires_at") @db.Timestamptz
  revokedAt       DateTime? @map("revoked_at") @db.Timestamptz
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz

  teacher Teacher @relation(fields: [teacherId], references: [id], onDelete: Cascade)

  @@index([teacherId])
  @@index([familyId])
  @@map("refresh_tokens")
}
```

- `onDelete: Cascade` — требование аудита №13 (GDPR). `@@index` на FK — правило проекта.
- **Абсолютный срок сессии:** `familyExpiresAt` = время входа + `SESSION_ABSOLUTE_TTL_MS`; при ротации копируется, не продлевается. `expiresAt` нового токена = `min(now + REFRESH_TOKEN_TTL_MS, familyExpiresAt)`.
- Ручные CHECK в миграции: `token_hash <> ''`, `expires_at > created_at`, `expires_at <= family_expires_at`. Добавить их в `MANUAL_CHECKS` в `tests/migrations.test.ts` — **файл tester'а**, передать ему.
- Миграции необратимы: схему показать reviewer'у до `prisma migrate dev`.

### 1.2а. Регистрация без захвата аккаунта до подтверждения

Проблема (reviewer, rev 2): если пароль лежит в `Teacher` до подтверждения и повторная регистрация его перезаписывает,
атакующий регистрирует тот же email своим паролем, учитель нажимает ссылку из письма — и аккаунт подтверждён **с паролем
атакующего**. Решаем в шаге 1, потому что `register` в нём.

```prisma
// Учителя ещё нет: строка Teacher создаётся только при подтверждении, вместе с паролем этой записи.
// На один email может быть несколько записей — у каждой свой токен и свой пароль
model PendingRegistration {
  id           String   @id @default(uuid()) @db.Uuid
  email        String
  passwordHash String   @map("password_hash")
  tokenHash    String   @unique @map("token_hash")
  expiresAt    DateTime @map("expires_at") @db.Timestamptz
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([email])
  @@map("pending_registrations")
}
```

- **Пароль до подтверждения не попадает в `Teacher`.** Хэш хранится в записи регистрации; `Teacher` создаётся в одной транзакции с удалением записи, когда владелец почты подтверждает её. CHECK `teachers_login_method_check` при этом соблюдается: у учителя сразу есть пароль, неподтверждённых учителей в `teachers` нет.
- **Подтверждение требует пароль:** `POST /api/auth/verify-email { token, password }`; пароль сверяется с `passwordHash` записи (`loginPasswordSchema`). Даже если письмо атакующего дойдёт до учителя, без пароля атакующего ссылка ничего не активирует.
- **Каждая регистрация — своя запись** со своим токеном и хэшем; существующие записи не перезаписываются и не блокируют новые. Запись создаётся, только если укладывается в бюджет писем регистрации (1.6); сверх бюджета — тот же `202` без записи и без письма. Поэтому число записей на email ограничено `REGISTRATION_EMAILS_PER_ADDRESS` / `…_PER_DAY`.
- **Подтверждение** проверяет пароль **своей** записи и в одной транзакции: `deleteMany({ where: { id, tokenHash } })` с проверкой `count === 1` (CAS: из двух одновременных запросов с одним токеном выигрывает один, второй — 400 без лишней работы), затем удаляет **все** записи этого email и создаёт `Teacher`.
- Письма-предупреждения «кто-то пытается зарегистрироваться» **нет**: обычное письмо подтверждения безопасно — без пароля своей записи его не активировать. Честный учитель, который ошибся в пароле или потерял письмо, просто регистрируется снова.
- Регистрация на email существующего учителя — письмо «аккаунт уже есть» (как в NatsDoll), тот же `202`.
- Ручные CHECK: `email = lower(email)`, `email <> ''`, `password_hash <> ''`, `token_hash <> ''`, `expires_at > created_at` — в `MANUAL_CHECKS` (tester).
- **Одинаковое время ответа:** `hash(password)` вычисляется **в начале `register`, во всех ветках** (новый адрес, ожидает подтверждения, уже учитель), до любых проверок; в ветке «уже учитель» хэш отбрасывается. Письма отправляются вне критического пути. Иначе ~10 мс argon2 выдают, есть ли адрес (так было и в NatsDoll, `register.ts:27`).
- Записи живут `PENDING_REGISTRATION_TTL_MS` (24 ч).
- `cleanup` удаляет записи с `expiresAt < now` — минимизация данных без отдельного срока для неподтверждённых учителей (вопрос 6 снят).
- Шаг 4: вход через Google на email с ожидающими регистрациями создаёт учителя с `googleId` и удаляет **все** записи этого email (пароли из них отбрасываются).

### 1.3. Env (`apps/api/src/shared/config/env.ts`)

| Переменная | Правило | Зачем |
|---|---|---|
| `JWT_SECRET` | обязательна, `refine((s) => Buffer.byteLength(s) >= MIN_SECRET_BYTES)` (32), а не `.length` — кириллица в секрете | подпись access JWT (HS256) |
| `HMAC_SECRET` | обязательна **в любом режиме**, то же правило длины, refine «≠ `JWT_SECRET`» | HMAC refresh/verify/reset-токенов. Отката на `JWT_SECRET` (как в NatsDoll) нет |
| `WEB_ORIGIN` | `z.url()`, обязателен, без значения по умолчанию; в `production` только `https://`; **наоборот тоже:** если `NODE_ENV !== 'production'`, а `WEB_ORIGIN` начинается с `https://`, env не проходит и API не стартует (production-адрес с dev-режимом — признак ошибки деплоя) | CORS whitelist, проверка `Origin`, ссылки в письмах |
| `TRUSTED_PROXY_IPS` | список через запятую; каждый элемент — `z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()])`; в `production` **обязателен и непуст** (`superRefine`), иначе env не проходит и API не стартует; в dev можно пусто | `X-Real-IP` принимается только от этих адресов сокета (Caddy). Сравнение — через `node:net` `BlockList` (`addAddress`/`addSubnet`), без зависимостей |

**Caddy в compose:** своя сеть с фиксированной `subnet` и `ipv4_address` у Caddy — IP не меняется при пересоздании контейнера;
в `TRUSTED_PROXY_IPS` — этот адрес (или CIDR сети, если в ней нет недоверенных контейнеров). Задача деплоя, вместе с Caddyfile.

Позже: `RESEND_API_KEY`, `EMAIL_FROM` (шаг 2), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (шаг 4) — по тем же правилам.
Сообщения без `issue.input`, как сейчас. `.env.example` — пустые значения и подсказка `openssl rand -base64 48`.

`index.ts`: `createApp({ env, prisma: createPrismaClient(env.DATABASE_URL) })`; `errorHandler` получает `env.NODE_ENV`
вместо `process.env.NODE_ENV` (hardening из аудита). Сигнатура `createApp` меняется → тесты `health`, `secureHeaders`,
`bodyLimit`, `errorHandler` вызывают `createApp()` — передать tester'у (нужна тестовая фабрика env/prisma).

### 1.4. Shared-схемы (`packages/shared/schemas/auth.ts`) и нормализация

- `registerSchema = z.object({ email: emailSchema, password: passwordSchema, displayName: displayNameSchema.optional() })` (решение 1). `displayNameSchema`: `trim()` (все `\s`), NFC, 1..`DISPLAY_NAME_MAX_LENGTH` = 100 code points, без Cc, `\p{Bidi_Control}` и одиночных суррогатов, хотя бы один видимый символ `[\p{L}\p{N}\p{S}\p{P}]` после удаления `\p{Default_Ignorable_Code_Point}` и U+2800 (иначе прошли бы ZWSP и Hangul Filler); одно сообщение на поле; в БД — CHECK длины, обрезки и Cc. В `Teacher` и `PendingRegistration` хранится NFC-строка.
- `loginPasswordSchema = z.string().normalize('NFC').min(1).max(MAX_PASSWORD_LENGTH)` + отказ при одиночных суррогатах (в UTF-8 они совпали бы с U+FFFD в сохранённом пароле) — **без** блок-листа и минимума: если блок-лист расширится, учитель со старым паролем всё равно войдёт. NFC — иначе пароль, набранный на macOS (NFD), не совпадёт с хэшем; `max` — как при регистрации.
- `loginSchema = z.object({ email: emailSchema, password: loginPasswordSchema })`.
- `authTokenSchema` — ровно `AUTH_TOKEN_LENGTH` = 43 символа base64url без `=` (`AUTH_TOKEN_BYTES` = 32; API генерирует токены по этой же константе).
- `verifyEmailSchema = z.object({ token: authTokenSchema, password: loginPasswordSchema })` (1.2а).
- Шаги 3–4 добавят: `forgotPasswordSchema = { email: emailSchema }`, `resetPasswordSchema = { token, password: passwordSchema }`, `changePasswordSchema = { currentPassword: loginPasswordSchema, newPassword: passwordSchema }`.
- **Email из профиля Google** тоже проходит `emailSchema.parse()` до `findByEmail` (шаг 4).
- Хэшируется **результат** `parse()` (NFC-строка), не сырое тело. Типы для фронта — `z.infer<>` через `schemas/index.ts`.
- Блок-лист NatsDoll не переносим: свой `isCommonPassword` строже.
- Тесты (tester): регистрация `A@B.CO` → вход `a@b.co` успешен; пароль с `é` в NFC при регистрации и NFD при входе — успешен.

### 1.5. Файлы NatsDoll → Nataskium

Путь в Nataskium: `apps/api/src/features/auth/…` и `apps/api/src/shared/…`. Общие правила для всех файлов:
комментарии только там, где без них неясно (шапки-пересказы NatsDoll не переносим); никаких магических чисел;
в `application/` нет импортов Prisma и Hono.

| NatsDoll | Решение | Куда / что меняется |
|---|---|---|
| `features/auth/index.ts` | **с адаптацией** | экспорт только шага 1; `issueTokensForUser` наружу не экспортируется (гостевого checkout нет) |
| — | **новый** `features/auth/types.ts` | `AuthRepository`, `TeacherAccount` (`{ id, email, passwordHash, googleId, emailVerifiedAt }`), `AuthTokensResult` — без типов Prisma; репозиторий маппит модель в этот тип |
| `application/register.ts` | **переписать по 1.2а** | без `name`; `hash(password)` первым шагом во всех ветках; новая запись `PendingRegistration` (пароль **не** в `Teacher`), старые записи не трогаются; существующий учитель → письмо «аккаунт уже есть»; сверх бюджета писем — без записи и без письма; ответ всегда `202`. Письма через интерфейс `EmailSender`, вне критического пути ответа; лог ошибки отправки — только `{ operation, errorType, status }` |
| `application/login.ts` | **с адаптацией** | `verify` в `try/catch` → `false` (битый хэш не даёт 500); `!emailVerifiedAt` → тот же 401 (защита в глубину: по 1.2а неподтверждённых учителей нет); dummy-хэш при отсутствии учителя или пароля; лимит неудач по email резервируется **до** `verify` (1.6); короткое сообщение без отсылок к магазину; создаёт **новую семью** refresh-токенов |
| `application/issueTokens.ts` | **с адаптацией** | `teacher` вместо `user`; ответ `{ id, email, hasPassword, hasGoogle }`; `signAccessToken({ sub })`; сохранение токена + ограничение сессий — одним методом репозитория в транзакции |
| `application/refreshToken.ts` | **с адаптацией** | CAS-ротация `rotateToken` как есть; reuse (`revokedAt !== null` или проигранный CAS) → удалить **семью** этого токена (решение тимлида 2026-11-05, по OAuth BCP: ложное срабатывание при потерянном ответе не выкидывает учителя со всех устройств; NatsDoll удалял все токены учителя); `familyExpiresAt - now < MIN_REMAINING_SESSION_MS` (в том числе уже истёкшая семья) → 401 и удалить семью — новый токен на несколько секунд не выдаётся, учитель входит заново; проверка, что учитель существует |
| `application/logout.ts` | **с адаптацией** | `findUnique` + `delete` → `repo.deleteTokenByHash()` через `deleteMany` (без гонки и P2025 → 500); удаляет всю семью текущего токена |
| `application/getMe.ts` | **с адаптацией** | без `name`/`role`; `GET /api/auth/me`. Учителя нет (удалён, а access JWT ещё жив до 15 мин) → **401**, не 404 и не 500. То же правило для всех use-case-ов за `requireAuth`: `AppError(401)`, если `findById` вернул `null` |
| `application/updateProfile.ts` | **не переносим** | имени нет; смена пароля — `changePassword` в шаге 3 |
| `application/verifyEmail.ts` | **переписать по 1.2а** (шаг 1, если шаги 1 и 2 объединены) | `{ token, password }`; запись по HMAC токена; истекла → 400; пароль не совпал → тот же 400 (без подсказки, что именно не так) + неудача резервируется в лимите по email до `verify`; транзакция: `deleteMany({ id, tokenHash })` и `count === 1` (иначе 400), удалить все записи email, создать `Teacher` (`passwordHash` из записи, `emailVerifiedAt = new Date()`); учитель с этим email уже есть (гонка с Google, P2002 в репозитории) → 400; выдать токены |
| `application/requestPasswordReset.ts`, `resetPassword.ts`, `googleAuth.ts` | шаги 3–4 | см. разделы 3–4 |
| `infrastructure/authRepository.ts` | **с адаптацией** | методы шага 1: `findByEmail`, `findById`, `createPendingRegistration` (→ `{ created }`), `findPendingByTokenHash`, `activatePendingRegistration` (транзакция: CAS-удаление своей записи, удаление всех записей email, создание `Teacher`; → `{ activated: boolean }`), `saveRefreshTokenAndLimitSessions`, `findTokenByHash`, `deleteTokenByHash`, `deleteFamily`, `deleteAllTeacherTokens`, `rotateToken`. Убрать `createGuestUser`, `createUser`, `deleteUser`, `updateUser`. P2002/P2025 ловятся **здесь**. Ограничение сессий: при > `MAX_ACTIVE_SESSIONS` удаляются самые старые **семьи** целиком; отозванные токены при входе **не удаляются** (их чистит cleanup по `expiresAt`), иначе reuse-detection перестаёт срабатывать |
| `presentation/authRoutes.ts` | **с адаптацией** | `makeAuthRouter(deps: AuthRouterDeps)` — объект зависимостей вместо 10 позиционных параметров; `readJsonBody(c, schema)`; схемы из `@nataskium/shared/schemas`; cookie-опции и лимитеры получает из `app.ts`; **никаких импортов из `infrastructure/`** |
| `shared/lib/tokens.ts` | **с адаптацией** → `features/auth/infrastructure/tokenService.ts` | `makeTokenService({ jwtSecret, hmacSecret })` — секреты параметрами; `randomBytes(32).toString('base64url')` вместо `randomUUID()` (256 бит); JWT: `setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })`, `setIssuer`, `setAudience`, `setIssuedAt`, `setExpirationTime`; `jwtVerify` с `algorithms`, `issuer`, `audience`, `typ`; payload разбирается Zod-схемой (`sub: z.uuid()`), без `as`; константы `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_MS`, `SESSION_ABSOLUTE_TTL_MS`, `JWT_ISSUER`, `JWT_AUDIENCE` |
| `shared/lib/dummyHash.ts` | **с адаптацией** → `features/auth/infrastructure/passwordHasher.ts` | `ARGON2_OPTIONS` (argon2id, m=19456 KiB, t=2, p=1 — минимум OWASP) одной константой для `hash` и `verify`; dummy-хэш генерируется при старте `hash(randomBytes(32), ARGON2_OPTIONS)`, поэтому параметры не разойдутся. Reviewer проверил: у NatsDoll параметры совпадают и тайминг 9.8 / 10.0 мс — вариант NatsDoll тоже корректен; тест (tester): параметры dummy-хэша = `ARGON2_OPTIONS`. `application/` получает `PasswordHasher` интерфейсом |
| `shared/lib/passwordBlocklist.ts` | **не переносим** | свой в `packages/shared/schemas/passwordBlocklist.ts` |
| `shared/lib/config.ts` | **не переносим** | → `WEB_ORIGIN` в `env.ts` |
| `shared/lib/zValidator.ts` | **не переносим** | `readJsonBody` |
| `shared/errors/index.ts` | **не переносим** | свои `AppError`/`ValidationError` |
| `shared/middleware/requireAuth.ts` | **с адаптацией** | получает `verifyAccessToken` параметром (`makeRequireAuth(verify)`), `c.set('teacherId', …)` через `ContextVariableMap`; константа `BEARER_PREFIX`; 401 с `WWW-Authenticate: Bearer` |
| `shared/middleware/requireAdmin.ts` | **не переносим** | роли нет; суперадмин — отдельным шагом с проверкой в БД и 2FA |
| `shared/middleware/rateLimit.ts` | **с адаптацией** | см. 1.6 |
| `shared/infrastructure/cleanup.ts` | **с адаптацией** | шаг 1: удалять токены с `expiresAt < now` (индекс `refresh_tokens_expires_at_idx`; условие по `familyExpiresAt` не нужно — CHECK `expires_at <= family_expires_at` гарантирует, что токен истекает не позже семьи); запуск `setInterval(...).unref()` из `index.ts`; лог — только счётчики; удалять `pending_registrations` с `expiresAt < now` (1.2а) |
| `tests/integration/authRefresh.int.test.ts` | **с адаптацией** (tester) | reuse-detection и параллельная ротация — как есть; плюс: reuse после нового входа всё равно удаляет семью этого токена (другие семьи учителя остаются); истёкший `familyExpiresAt` → 401. Нужна инфраструктура интеграционных тестов (тестовая БД, `vitest.integration.config.ts`, защита от не-тестового `DATABASE_URL`) |

`errorHandler` (`apps/api/src/shared/middleware/errorHandler.ts`): переносить заголовки из `AppError`/`HTTPException`
(`Retry-After`, `WWW-Authenticate`) — требование аудита №8. Вариант: `AppError` с необязательным `headers`.

### 1.6. Rate limit (`shared/middleware/rateLimit.ts`)

**Ключ IP:**
- **IPv6 — сеть /64** (`IPV6_RATE_LIMIT_PREFIX`), IPv4 и `::ffff:a.b.c.d` — полный IPv4: провайдер обычно выдаёт клиенту IPv6 целую /64, и по полному адресу лимит обходился бы сменой адреса внутри сети. Сжатая и полная записи адреса дают один ключ. Доверие к прокси проверяется по полному адресу. **Принятый риск** (раздел 8а): VPS с /48 или /56 дают атакующему до 65 536 / 256 ключей /64.
- Адрес сокета из `getConnInfo`; перед сравнением `::ffff:a.b.c.d` приводится к `a.b.c.d` (сокет с двумя стеками).
- Семейство для `BlockList.check(addr, family)` берётся **из `net.isIP(addr)`** (4 → `'ipv4'`, 6 → `'ipv6'`, 0 → не IP). `check` с неверным семейством или мусором молча возвращает `false` (проверено reviewer'ом на Node 26), поэтому семейство не угадываем и не хардкодим.
- `X-Real-IP` читается, **только если адрес сокета в `TRUSTED_PROXY_IPS`** (`BlockList`, 1.3). Значение — `trim()`, затем `net.isIP()` (`'1.2.3.4 '` без `trim` даёт 0) и та же нормализация `::ffff:`; не IP → используется адрес сокета, в лог — событие без значения заголовка. `X-Forwarded-For` не используется.
- Адрес не определён → не общий ключ `'unknown'`, а отказ 500 с логом (в тестах адрес задаётся явно).
- Без нормализации `::ffff:` и при пустом списке в production все запросы получили бы ключ адреса Caddy, и `LOGIN_PER_IP` действовал бы на весь сайт — поэтому список в production обязателен (1.3).

**Лимиты по email** (вход, регистрация, письма):
- Проверяются **внутри обработчика после `readJsonBody`**, по нормализованному `emailSchema` адресу — не в middleware до разбора тела (иначе `A@b.co`, ` a@b.co`, `a@B.CO` — разные ключи).
- Неудачный вход **резервируется до `verify`**: `tryReserve(key)` проверяет и увеличивает счётчик за один синхронный шаг (без `await` между проверкой и записью — в одном потоке Node это атомарно); при успешном входе — `release(reservation)`. Без этого 1000 параллельных запросов прошли бы проверку «< лимита» до первой записанной неудачи.
- `tryReserve` возвращает резерв с меткой окна (`resetAt`); `release` ничего не делает, если окно ключа уже сменилось — иначе успешный вход уменьшил бы счётчик нового окна.
- Ответ 429 по email одинаков для существующего и несуществующего адреса.

**Размер памяти:** у каждого лимитера `MAX_TRACKED_KEYS` (именованная константа). При переполнении — одна очистка до
`EVICTION_TARGET_KEYS` (ниже максимума, чтобы не чистить на каждой вставке):
1. удаляются истёкшие записи;
2. затем записи **с наименьшим счётчиком** (ключи со счётчиком 1 — шум перебора случайных адресов);
3. ключи, у которых счётчик **≥ порога** своего лимита (например, ≥ `LOGIN_FAILURES_PER_EMAIL`, и вообще любые, уже
   отвечающие 429), **не вытесняются никогда** до конца окна.

Вытеснение «самых старых» не подходит: распределённый атакующий, ради которого и нужен лимит по email, заполнил бы Map
случайными адресами и сбросил счётчик жертвы. Если после очистки места всё равно нет (вся Map из ключей у порога — это
требует `MAX_TRACKED_KEYS × порог` неудач), новый ключ не отслеживается, срабатывают только лимиты по IP; событие
логируется (счётчики, без ключей). 429 для всех новых ключей не выбран: он блокировал бы вход всем учителям.

**429** с `Retry-After` (секунды до сброса окна) — через `AppError` с заголовками (1.5).

**Ключи и лимиты** — именованные константы в одном месте (числа стартовые, вопрос 4):

| Маршрут | Ключ | Лимит |
|---|---|---|
| `POST /api/auth/login` | `IP + email` (строгий) | `LOGIN_PER_IP_EMAIL` = 10 / 15 мин |
| `POST /api/auth/login` | IP (мягкий — школьный NAT) | `LOGIN_PER_IP` = 100 / 15 мин |
| `POST /api/auth/login`, `/verify-email` | email, только **неудачные** попытки, резерв до `verify` | `LOGIN_FAILURES_PER_EMAIL` = **10** / 15 мин (утверждено пользователем 2026-11-05; риск блокировки входа учителю посторонним принят) |
| `POST /api/auth/register` | IP (мягкий) | `REGISTER_PER_IP` = 30 / час |
| письма регистрации (подтверждение и «аккаунт уже есть») | email | `REGISTRATION_EMAILS_PER_ADDRESS` = 3 / час и `REGISTRATION_EMAILS_PER_ADDRESS_PER_DAY` = 5 / сутки |
| письма сброса пароля (сброс и «войдите через Google») | email | `RESET_EMAILS_PER_ADDRESS` = 3 / час и `RESET_EMAILS_PER_ADDRESS_PER_DAY` = 5 / сутки |
| `POST /api/auth/refresh`, `/logout` | IP | 60 / 15 мин |

- Бюджеты писем **раздельные**: спам регистрациями на адрес учителя не съедает его письма сброса. Суточный потолок — тоже по назначению; в сумме не больше 10 писем в сутки на адрес (репутация домена у почтовых провайдеров). Если бы потолок был общим, посторонний исчерпал бы его регистрациями и снова заблокировал сброс. Сверх бюджета — тот же общий ответ без письма.
- Лимитеры создаются в `app.ts` и передаются в роутер (не на уровне модуля — тесты не делят счётчики).
- **Числа лимитов — конфигурация, но не по `NODE_ENV`:** `createApp({ env, prisma, limits })`. `src/index.ts` (production и dev) **всегда** передаёт `PRODUCTION_LIMITS` — от `NODE_ENV` и любых переменных окружения лимиты не зависят, поэтому ошибка в `NODE_ENV` на сервере их не ослабит. `TEST_LIMITS` передают только тесты: unit и интеграционные — через свой `createApp` (свежие счётчики) или `limiter.reset()`; e2e — через **отдельную точку входа** `apps/api/tests/e2e/server.ts` (вне `src/`), которая создаёт приложение с `TEST_LIMITS`. Эта точка входа не попадает в Docker-образ: в `Dockerfile` копируется только `src/` и собранный вывод, а `tests/` перечислен в `.dockerignore` (обоих файлов пока нет — требование к задаче деплоя; проверка в CI: в образе нет `tests/`). Каждый e2e-сценарий использует уникальный email — иначе через devProxy все запросы идут с `127.0.0.1` и упираются в `LOGIN_PER_IP_EMAIL` / `REGISTER_PER_IP`. HTTP-маршрута для сброса лимитов нет.

**Очередь argon2:** `@node-rs/argon2` работает в пуле libuv (4 потока, ~4 × 19 MiB), очередь не ограничена; при наплыве
входов растут задержки, а тот же пул обслуживает `fs`/`dns`. В `passwordHasher` — счётчик задач в работе и
`MAX_PENDING_HASH_JOBS` (именованная константа): сверх неё `hash`/`verify` не ставятся в очередь, ответ **503 с
`Retry-After`**. Считаются все вызовы, включая dummy-хэш и хэш в `register`, поэтому 503 не выдаёт существование адреса.
Число подбирается нагрузочной проверкой перед деплоем; лимиты по IP сами по себе очередь не ограничивают (школьный NAT
даёт 100 входов за 15 мин с одного IP, много школ — больше).
- In-memory → одна реплика `api` (уже в `docs/architecture.md`).
- Тесты (tester): подделанный `X-Real-IP` с недоверенного адреса не меняет ключ; с доверенного — меняет; доверенный адрес распознаётся в обоих видах (`a.b.c.d` и `::ffff:a.b.c.d`); `X-Real-IP: ' 1.2.3.4 '` от доверенного → ключ `1.2.3.4`; `X-Real-IP: not-an-ip` → ключ по сокету; `A@B.CO` и `a@b.co` — один ключ; N параллельных неудачных входов не превышают лимит; `release` после смены окна не уменьшает новый счётчик; заполнение Map случайными email не сбрасывает ключ с 19 неудачами и не вытесняет ключ у порога; при `MAX_TRACKED_KEYS` Map не растёт; спам регистрациями не расходует бюджет сброса; 429 и 503 содержат `Retry-After`.
**503 не засчитывается как неудачный вход:** в `login` и `verify-email` потолок очереди проверяется **до** `tryReserve`
(`passwordHasher.hasCapacity()`); если хэш всё же отклонён с 503 после резерва (гонка), резерв снимается `release`.
Иначе перегрузка сервера расходовала бы лимит неудач учителя и блокировала ему вход.

### 1.7. Маршруты шага 1 (`/api/auth`)

| Метод | Путь | Ответ |
|---|---|---|
| POST | `/api/auth/register` | `202 { message }` — одинаково для нового, существующего и ожидающего подтверждения email |
| POST | `/api/auth/verify-email` | `200 { accessToken, teacher }` + refresh cookie (1.2а; если шаги 1 и 2 объединены) |
| POST | `/api/auth/login` | `200 { accessToken, teacher }` + refresh cookie |
| POST | `/api/auth/refresh` | `200 { accessToken, teacher }` + новая cookie (`teacher` — чтобы фронт при загрузке страницы восстанавливал сессию без отдельного `/me`; решение тимлида 2026-11-05) |
| POST | `/api/auth/logout` | `204`, cookie удалена |
| GET | `/api/auth/me` | `200 { teacher }`, `requireAuth`; учителя нет → 401 |

Hono монтирует роутер **всегда** на `/api/auth` (`app.route('/api/auth', …)`), Caddy префикс не срезает.
`/health` остаётся на месте (или переезжает в `/api/health` — решить вместе с Caddyfile).

**Refresh cookie** (аудит №11):
- имя `__Secure-refresh_token`; `httpOnly`; `Secure` **всегда** (нет флага, который его выключает — production не ослабляется); `SameSite=Strict`; `Path=/api/auth`; `Max-Age` = остаток `expiresAt`.
- `deleteCookie` — с теми же `path`, `secure` и префиксом, иначе браузер её не удалит.
- Для `/refresh` и `/logout` — проверка `Origin === WEB_ORIGIN` (CSRF поверх SameSite).

### 1.7а. Локальная схема (dev)

- **Обычная разработка:** браузер → `http://localhost:3000` (Nuxt). `nitro.devProxy` в `nuxt.config.ts`: `/api` → `http://127.0.0.1:3001/api` (только `nuxt dev`, в сборку не попадает). Фронт ходит на относительный `/api/auth/...` — запросы same-origin, cookie `Path=/api/auth` уходит, CORS в dev не участвует. `WEB_ORIGIN=http://localhost:3000`; проверить, что прокси сохраняет `Origin`, иначе `/refresh` получит 403.
- **`Secure` на `http://localhost`:** Chromium и Firefox считают `localhost` безопасным контекстом и принимают `Secure`/`__Secure-` cookie. WebKit/Safari — **проверить** на текущей версии и записать результат в 1.9. Если Safari не принимает — локальный HTTPS (ниже), а не ослабление `Secure`.
- **Телефон в той же Wi-Fi** (`http://192.168.x.x:3000` — не secure context, cookie будет отклонена): опционально локальный Caddy с `tls internal` (или mkcert) перед Nuxt и API, корневой сертификат ставится на телефон. Без этого вход на телефоне проверяем только за HTTPS (staging или локальный Caddy). Mobile-first-вёрстку можно проверять без входа.
- Production не меняется: `Secure` всегда, CORS-whitelist остаётся для случая, если API окажется на другом домене.

### 1.8. `app.ts` (composition root)

1. **CORS первым middleware** (отложен до этого шага, memory `api-cors-deferred`): `cors({ origin: [env.WEB_ORIGIN], credentials: true, allowMethods: ['GET','POST','PATCH','DELETE'], allowHeaders: ['Content-Type','Authorization'] })`. Без `*` и без отражения `Origin`.
2. `secureHeaders`, `bodyLimit`, `nonErrorHandler` — как сейчас.
3. `tokenService`, `passwordHasher`, `authRepository`, лимитеры → use-cases → `app.route('/api/auth', makeAuthRouter({ ... }))`.
4. `index.ts`: по-прежнему `127.0.0.1` (аудит №10).

### 1.9. Критерий готовности шага 1

- `register` → `verify-email` (с паролем) → `login` → `me` → `refresh` → `logout` проходят в unit/интеграционных тестах **и в настоящем браузере** (Playwright e2e через `nuxt dev` + devProxy): после перезагрузки страницы сессия восстанавливается через `/api/auth/refresh` — это проверяет `Path`, `Secure`, `SameSite` и same-origin, чего `app.request` с вручную выставленным `Cookie` не проверяет.
- Тот же e2e-сценарий в WebKit (проект `webkit` в `playwright.config.ts` — передать tester'у; сейчас там только Chromium) или вручную в Safari. **Результат записать сюда:** принимает ли Safari `__Secure-` cookie на `http://localhost` — _не проверено_.
- Захват до подтверждения (1.2а): две регистрации на один email дают две записи; подтверждение чужой записи с паролем учителя не создаёт учителя; подтверждение своей записи создаёт учителя с **её** паролем и удаляет все записи email; два одновременных `verify-email` с одним токеном — ровно один успешен; учитель появляется в `teachers` только после подтверждения.
- Повторный refresh старым токеном удаляет **семью** этого токена (решение 2026-11-05; другие устройства учителя не затрагиваются), **в том числе после нового входа**; две параллельные ротации — ровно одна успешна; после `familyExpiresAt` refresh даёт 401.
- `login` вызывает `verify` и для несуществующего email, и для неверного пароля (unit-тест).
- Вход с другим регистром email и с NFD-паролем успешен.
- Ответ `register` одинаков для нового, ожидающего и существующего email; `hash` вызывается во всех трёх ветках (unit-тест).
- Сверх `MAX_PENDING_HASH_JOBS` — 503 с `Retry-After`; e2e-сценарии не упираются в лимиты (`TEST_LIMITS` через отдельную точку входа, уникальные email); 503 не увеличивает счётчик неудач (тест); `src/index.ts` передаёт `PRODUCTION_LIMITS` при любом `NODE_ENV`; env с `NODE_ENV=development` и `WEB_ORIGIN=https://…` не стартует.
- JWT без `typ`/`aud`/`iss` или с чужими значениями отклоняется.
- В ответах и логах нет пароля, хэша, токенов, email, объектов ошибок целиком.
- Подделанный `X-Real-IP` не обходит лимит; `::ffff:` нормализуется; лимиты по email считаются по нормализованному адресу и не превышаются параллельными запросами; `MAX_TRACKED_KEYS` соблюдается; 429 с `Retry-After`.
- Env без `TRUSTED_PROXY_IPS` в production не стартует; секрет из 31 байта (в том числе кириллицей, 16 символов = 32 байта проходит) — проверка по байтам.
- Access JWT учителя, которого уже нет в БД: `GET /api/auth/me` → 401, не 500.
- `application/` не импортирует Prisma и Hono; `presentation/` не импортирует `infrastructure/` (проверить grep'ом или ESLint `no-restricted-imports`).
- `npm run test`, `typecheck`, `npm audit` (без high/critical); reviewer — APPROVED.

---

## 1.10. Инфраструктура интеграционных тестов (до части D)

Цель: репозитории и use-case-ы части D проверяются на настоящем PostgreSQL (CAS-ротация, каскады, CHECK, P2002),
dev-БД при этом не затрагивается никогда. Новых npm-зависимостей нет: `vitest`, `prisma`, `pg`, `node:util` уже есть.

**Тестовая БД — отдельный сервис `db-test` в `docker-compose.yml`:**
- тот же образ, что у `db`; `profiles: ["test"]` — обычный `docker compose up -d` его не поднимает, запуск явно: `docker compose up -d db-test`;
- порт `127.0.0.1:5433:5432` (dev — 5432), наружу не публикуется;
- данные в `tmpfs` (`/var/lib/postgresql`): быстро, после остановки ничего не остаётся, том dev-БД не используется;
- креды из `env_file: .env.test` (не из корневого `.env`), имя базы `nataskium_test`, пользователь `nataskium_test`.

**Креды:** `.env.test.example` в корне — коммитится (в `.gitignore` добавить `!.env.test.example`, правило `.env.*` уже скрывает `.env.test`).
Значения не секретные (БД только на loopback и в tmpfs), но файл повторяет привычный порядок: `cp .env.test.example .env.test`.
Содержимое: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (для контейнера) и `DATABASE_URL=postgresql://nataskium_test:…@127.0.0.1:5433/nataskium_test`.
Раннер читает `.env.test` через `fs` + `util.parseEnv` в отдельный объект — **не** в `process.env` и не из корневого `.env`;
`DATABASE_URL` из окружения оболочки игнорируется.

**Защита от запуска на dev-БД** (`tests/integration/testDatabase.ts`, `assertTestDatabaseUrl`) — первым шагом `globalSetup`,
до `migrate deploy` и любого подключения; при нарушении — исключение и ни одной операции:
- `.env.test` существует, `DATABASE_URL` в нём — postgresql-URL;
- хост — `127.0.0.1`, `localhost` или `::1`; порт — `TEST_DATABASE_PORT` = 5433; имя базы оканчивается на `TEST_DATABASE_SUFFIX` = `_test`;
- URL не совпадает с `DATABASE_URL` из корневого `.env` (если тот есть); `NODE_ENV !== 'production'`;
- после подключения второй рубеж: `SELECT current_database()` тоже оканчивается на `_test`, иначе отключиться и упасть.
Сама проверка покрывается **unit-тестами** (без Docker): dev-URL, порт 5432, имя без `_test`, удалённый хост — отказ.

**Миграции:** `globalSetup` запускает `prisma migrate deploy` (`spawnSync`, `cwd: apps/api`) с **явным**
`env: { ...process.env, DATABASE_URL: testUrl }`. `prisma7.config.ts` подгружает корневой `.env` через `process.loadEnvFile`,
но он не перезаписывает уже заданные переменные (проверено на Node 26), поэтому CLI идёт в тестовую БД. `migrate deploy`,
а не `migrate dev`: не создаёт миграций и не предлагает reset. Если `migrate deploy` упал — тесты не запускаются.

**Изоляция — `TRUNCATE` перед каждым тестом, не транзакции:**
- транзакция-на-тест с откатом не подходит: репозитории сами открывают `$transaction` (вложенных интерактивных транзакций в Prisma нет), а тесты гонок (две параллельные CAS-ротации, P2002 при двух регистрациях) требуют двух настоящих соединений, которые видят коммиты друг друга;
- `truncateAll(prisma)` в `beforeEach`: одна SQL-команда, список таблиц берётся из `pg_tables` схемы `public` кроме `_prisma_migrations` и собирается через `format('%I')` **внутри SQL** (`DO`-блок в `$executeRaw` без подстановок из JS) — новые таблицы покрываются сами, `$executeRawUnsafe` не нужен;
- `TRUNCATE … RESTART IDENTITY CASCADE` — на таблицах из десятков строк быстрее, чем пересоздание базы.

**Параллельность vitest:** база одна, поэтому в интеграционном конфиге `fileParallelism: false` — файлы идут по очереди,
тесты внутри файла и так последовательны; параллельные запросы *внутри* теста (гонки) работают как обычно.
Если набор станет медленным — следующий шаг: база на воркер (`nataskium_test_${VITEST_POOL_ID}` из шаблона после
`migrate deploy`), защита та же (суффикс `_test`). Сейчас не нужно.

**Конфиги и скрипты:**
- новый `apps/api/vitest.config.ts` (unit): `exclude: ['tests/integration/**']` — `npm run test` работает без Docker, как сейчас;
- новый `apps/api/vitest.integration.config.ts`: `include: ['tests/integration/**/*.int.test.ts']`, `globalSetup`, `fileParallelism: false`, увеличенный `testTimeout`;
- `apps/api/package.json`: `"test:integration": "vitest run --config vitest.integration.config.ts"`; корневой `npm run test` его не вызывает.
- Prisma-клиент в тестах — `createPrismaClient(testUrl)` из `shared/infrastructure`, `$disconnect()` в `afterAll`.

**CI (позже, кратко):** job с service-контейнером `postgres` того же образа на `127.0.0.1:5433` (tmpfs через `--tmpfs`),
`cp .env.test.example .env.test`, `npm ci`, `npm run test`, затем `npm run test:integration -w @nataskium/api`.
Защита та же; dev-БД в CI нет вовсе.

**Файлы:**

| Файл | Что |
|---|---|
| `docker-compose.yml` | сервис `db-test` (profile `test`, `127.0.0.1:5433`, `tmpfs`, `env_file: .env.test`) |
| `.env.test.example` | новый: креды тестовой БД и `DATABASE_URL` |
| `.gitignore` | `!.env.test.example` |
| `apps/api/vitest.config.ts` | новый: unit без `tests/integration` |
| `apps/api/vitest.integration.config.ts` | новый |
| `apps/api/tests/integration/testDatabase.ts` | новый: чтение `.env.test`, `assertTestDatabaseUrl`, `createTestPrisma`, `truncateAll` |
| `apps/api/tests/integration/globalSetup.ts` | новый: защита → `migrate deploy` |
| `apps/api/package.json` | скрипт `test:integration` |
| `docs/architecture.md` (раздел «Тесты») | как поднять `db-test` и запустить — в части G |

Файлы в `tests/` — зона tester: инфраструктуру (`testDatabase.ts`, `globalSetup.ts`, конфиги) пишу я, если тимлид не решит
иначе; unit-тесты защиты и сами `*.int.test.ts` — tester.

## 2. Шаг 2 — email-верификация (Resend), кратко

С ревизии 3 подтверждение — это `PendingRegistration` и `verifyEmail` из 1.2а/1.5; отдельной таблицы `EmailVerification`
нет (рекомендация — делать шаги 1 и 2 вместе, вопрос 2). В шаге 2 остаётся отправка писем:
- `emailService.ts` **с адаптацией**: только `sendVerificationEmail` и `sendAccountExistsEmail`; остальные 9 методов не переносим (письма-предупреждения о регистрации нет — 1.2а). `RESEND_API_KEY`, `EMAIL_FROM` из env; таймаут 8 с (именованная константа); HTML только из server-controlled значений, остальное через `escapeHtml`. Ошибки Resend логируются без адреса и без `err` целиком.
- Ссылка: `WEB_ORIGIN/auth/verify#token=…` (фрагмент не попадает в логи Caddy, историю запросов сервера и `Referer`); фронт показывает поле пароля и отправляет `{ token, password }` в `POST /api/auth/verify-email`. Дополнительно `Referrer-Policy: no-referrer` на страницах `/auth/**` (Caddy).
- Бюджет писем регистрации `REGISTRATION_EMAILS_PER_ADDRESS` / `…_PER_DAY` (1.6), отдельно от сброса.
- Если шаг 1 всё же делается без писем — `EmailSender`-заглушка по вопросу 2.

## 3. Шаг 3 — сброс и смена пароля, кратко

- Prisma: `PasswordReset` (`teacher_id` Cascade + `@@index`, `token_hash @unique`), отдельная миграция.
- `requestPasswordReset.ts` **с адаптацией**:
  - email через `forgotPasswordSchema` (`emailSchema`);
  - **ветки «гость без пароля» нет**: если `passwordHash === null` и `googleId === null` — общий ответ, письмо не отправляется (такого учителя быть не должно: CHECK `teachers_login_method_check`);
  - Google-учителю без пароля — письмо «аккаунт есть, войдите через Google»;
  - перед созданием новой записи — `deleteMany({ where: { teacherId } })` (старые ссылки перестают работать);
  - `hash` (или dummy-хэш) во всех ветках, как в `register`, — одинаковое время ответа;
  - лимиты: IP (мягкий) + `RESET_EMAILS_PER_ADDRESS` / `…_PER_DAY` по email (отдельно от регистрации, 1.6); сверх лимита — тот же общий ответ без письма.
- `resetPassword.ts` **с адаптацией**: пароль через `passwordSchema`; `finalizePasswordReset` в транзакции: новый хэш, удалить **все** записи сброса и **все** refresh-токены учителя (неподтверждённых учителей по 1.2а нет, поэтому `emailVerifiedAt` не трогаем).
- `changePassword.ts` (вместо `updateProfile`): `changePasswordSchema`; неверный текущий пароль → **400** (не 401, иначе фронт решит, что сессия истекла); удаляются все семьи, кроме текущей.
- Ссылка во фрагменте, TTL `PASSWORD_RESET_TTL_MS` = 1 час.
- Учитель не найден (удалён при живом access JWT) в `changePassword` → 401.

## 4. Шаг 4 — Google OAuth, кратко

- `googleClient.ts` **переписать**, `googleapis` не берём: Authorization Code + **PKCE** (`code_verifier`) + `state` + `nonce`; обмен кода — `fetch` к token endpoint с таймаутом; профиль — из `id_token`, проверенного `jose` (`createRemoteJWKSet`; `iss`, `aud`, `exp`, `nonce`, `email_verified`); `googleId = sub`. Альтернатива — `google-auth-library` 11.3.3 (`OAuth2Client.verifyIdToken`), вопрос 8.
- Email из `id_token` → `emailSchema.parse()` до `findByEmail`.
- Генерация URL и обмен кода — функции, которые `app.ts` передаёт в роутер (роутер не импортирует infrastructure).
- `googleAuth.ts` **с адаптацией** (неподтверждённых учителей по 1.2а нет). Транзакция начинается с `lockEmail(tx, email)` из `pendingRegistrationRepository` — иначе вход через Google и подтверждение регистрации того же email взаимно заблокируются на удалении записей `pending_registrations`:
  - найден по `googleId` → вход;
  - найден учитель по email → привязать `googleId`, отправить письмо «к аккаунту привязан Google», отозвать остальные семьи сессий. Пароль сохраняется: по 1.2а он подтверждён владельцем почты (ссылка + ввод пароля);
  - есть записи `PendingRegistration` на этот email → в одной транзакции создать учителя с `googleId` **без пароля** и удалить **все** записи email (пароли, заданные до подтверждения, отбрасываются — reviewer, сценарий 2);
  - иначе — создать учителя.
  - **Если пользователь выберет вариант без `PendingRegistration`** (пароль в `Teacher` до подтверждения): при привязке Google к аккаунту, пароль которого задан до подтверждения, сбрасывать `passwordHash`, отзывать все сессии и отправлять письмо. Для этого понадобится признак «пароль задан до подтверждения».
- Cookie `__Secure-oauth`: `state` + `code_verifier` + `nonce`, `SameSite=Lax` (иначе callback её не получит), `httpOnly`, `Secure`, `Max-Age` 5 мин, `Path=/api/auth/google`.
- Callback → редирект на `WEB_ORIGIN/auth/callback`; фронт получает access token через `/api/auth/refresh`. Ошибки Google логируются только кодом и статусом (без `config`, тела, query).
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (= `WEB_ORIGIN/api/auth/google/callback` во всех средах, в dev — через devProxy). COOP `same-origin-allow-popups` уже в `docs/architecture.md`.

## 5. Шаг 5 — фронт `/auth/**`, кратко

- `routeRules`: `/auth/**`, `/teacher/**` — `ssr: false`.
- `src/features/auth/`: `store.ts` (Pinia, обязателен) — access token **только в памяти**; `authApi.ts` — `credentials: 'include'`; **single-flight refresh** в вкладке и между вкладками (`navigator.locks` или `BroadcastChannel`), иначе две вкладки сработают как reuse и разлогинят учителя; восстановление сессии через `/api/auth/refresh` при загрузке; запросы на относительный `/api/...` (same-origin и в dev, и в production). При потере ответа refresh (сеть) клиент **не повторяет** запрос автоматически со старым токеном, пока не решён вопрос 10.
- Формы валидируют `registerSchema`/`loginSchema` из shared (сервер проверяет снова); ошибки из `issues`. 400 при смене пароля не трактуется как выход.
- Страница `/auth/verify` просит пароль (1.2а). Страницы `/auth/login`, `/auth/register`, `/auth/verify`, `/auth/forgot`, `/auth/reset`, `/auth/callback`: тонкие файлы в `app/pages/auth/`, страницы в `src/pages/`. Токен из фрагмента читается и сразу убирается из адресной строки (`history.replaceState`).
- Guard `/teacher/**` — middleware Nuxt по store. BEM, mobile-first (memory), дизайн — `ui-designer`.

## 6. Шаг 6 — удаление аккаунта (GDPR), кратко

- Use-case `deleteAccount`: подтверждение паролем (`loginPasswordSchema`) или свежим входом через Google; первой командой транзакции `lockEmail(tx, email)`, затем физическое удаление `Teacher` и в той же транзакции `pending_registrations` с его email (у них нет FK на `Teacher`, каскад их не удалит); каскад на токены, сбросы, а позже задания и шкалы (`onDelete: Cascade` на каждом FK от `Teacher`); удаление cookie.
- Access JWT удалённого учителя живёт до 15 мин: все use-case-ы за `requireAuth` отвечают 401, если учителя нет (1.5, `getMe`).
- Маршрут `DELETE /api/auth/me`, `requireAuth`, rate limit. Когда делать — решение пользователя (вопрос 9); каскады закладываются уже в шагах 1–3.

---

## 7. Чего из NatsDoll не переносим совсем

`createGuestUser` и гостевой checkout, ветку «гость задаёт первый пароль» в сбросе, `issueTokensForUser` как публичный экспорт,
`updateProfile`, `name`, `role`/`requireAdmin`, `zValidator` и `zod/v3`, `config.ts`, `passwordBlocklist.ts`, `googleapis`,
9 из 11 методов `emailService`, разбор Prisma-ошибок в `onError`, шапки-комментарии, 10 позиционных параметров роутера.

## 8. Слабые места NatsDoll, которые исправляем

1. Rate limit верит `X-Real-IP`/`X-Forwarded-For` и сводит неизвестные адреса в `'unknown'` → `TRUSTED_PROXY_IPS`, только сокет (1.6).
2. Секреты и `Secure` из сырого `process.env`, `HMAC_SECRET` откатывается на `JWT_SECRET`, `FRONTEND_URL` по умолчанию localhost → `env.ts` (1.3), `Secure` всегда.
3. Email не нормализуется, пароль не NFC → `emailSchema` везде, `loginPasswordSchema` (1.4).
4. Prisma в use-case-ах, роутер импортирует infrastructure → `types.ts`, ошибки в репозитории, зависимости из `app.ts` (1.5).
5. Модель с `name`/`role`/гостями → `Teacher` (раздел 0).
6. Cookie `Path=/`, без префикса → `__Secure-`, `Path=/api/auth` (1.7).
7. `console.error(..., err)` → только операция, код, статус, `teacherId`.
8. Токены в query → во фрагменте (2, 3).
9. Старые ссылки сброса живут, нет лимита писем → удаление прежних записей, раздельные бюджеты писем с суточным потолком (1.6, 3).
10. Лимит только по IP, без `Retry-After` → ключи IP+email / IP / email, `Retry-After` (1.6).
11. Google без PKCE, nonce и `id_token` → раздел 4.
12. Reuse-detection ослабляется при каждом входе, нет абсолютного срока → семьи, `familyExpiresAt`, отозванные чистит только cleanup (1.2, 1.5).
13. `randomUUID()` (122 бита) → `randomBytes(32)`.
14. JWT без `iss`/`aud`/`typ`, `role as string` → 1.5 (`tokenService`).
15. Неверный текущий пароль → 401 → 400 (3).
16. `verify` без `try/catch`, `logout` с гонкой P2025 → 1.5.
17. Повторная регистрация перезаписывает пароль неподтверждённого аккаунта → подтверждённый аккаунт с паролем атакующего → `PendingRegistration` (несколько записей на email, подтверждение паролем своей записи, удаление всех записей email при активации) (1.2а).
18. `getMe` при отсутствии пользователя → 404 → 401 для всех маршрутов за `requireAuth`.
19. Неограниченная очередь argon2 → `MAX_PENDING_HASH_JOBS`, 503 с `Retry-After` (1.6).

## 8а. Принятые риски

| Риск | Почему принят | Если понадобится |
|---|---|---|
| VPS с IPv6 /48 или /56 дают атакующему до 65 536 / 256 ключей /64 для лимитов по IP | Лимит неудач по email (`LOGIN_FAILURES_PER_EMAIL`, 10 за 15 мин) от числа адресов не зависит — перебор пароля конкретного учителя он ограничивает при любом числе /64 | Мягкий лимит по /48 для `POST /api/auth/login` |
| Посторонний за 5 запросов в сутки исчерпывает бюджет писем регистрации чужого адреса (вопрос 4) | Защита репутации домена и почты учителя от спама; утверждено пользователем | Вход через Google (шаг 4) обходит письмо |
| Посторонний может временно (15 мин) заблокировать вход учителю, исчерпав лимит неудач по его email (вопрос 4) | Иначе пароли от 4 символов перебирались бы с многих адресов; утверждено пользователем | Нарастающая задержка вместо блокировки |

## 9. Правки документации (отдельной задачей, после согласия пользователя)

- `docs/architecture.md:374` — «Refresh token: JWT» → «непрозрачная случайная строка (256 бит), в БД — HMAC-SHA256; ротация с семьями и абсолютным сроком».
- Добавить в `docs/architecture.md`: `TRUSTED_PROXY_IPS` и статический IP Caddy в compose; единые пути `/api/auth` (Caddy не срезает `/api`, в dev — `nitro.devProxy`); cookie `__Secure-refresh_token` с `Path=/api/auth`; `Referrer-Policy: no-referrer` для `/auth/**` в Caddy; регистрация через `PendingRegistration` (учитель создаётся при подтверждении).

## 10а. Решения пользователя (2026-11-05)

| № | Вопрос | Решение |
|---|---|---|
| 1 | Имя учителя | `displayName` — необязательное, ≤ 100 code points (`DISPLAY_NAME_MAX_LENGTH`) |
| 2 | Шаг 1 без писем | Шаги 1 и 2 объединены: регистрация + письмо подтверждения через Resend |
| 3 | Refresh не JWT | Правка `docs/architecture.md:374` — в рамках этой работы, в общем коммите |
| 4 | Лимиты | Как в 1.6; риск исчерпания бюджета писем чужого адреса принят (обход — вход через Google) |
| 5 | Caddy и `/api` | Hono на `/api/auth`, Caddy префикс не срезает, в dev — `nitro.devProxy`. Вход с телефона в локальной Wi-Fi в dev **не делаем** (локальный Caddy с `tls internal` не нужен) |
| 6 | Неподтверждённые аккаунты | Снят: учитель создаётся только при подтверждении (1.2а) |
| 7 | Сроки | Access 15 мин; refresh **14 дней** (скользящий); абсолютный срок сессии **30 дней**; кнопка «выйти на всех устройствах» |
| 8 | Google | `fetch` + `jose`, без новых зависимостей |
| 9 | Удаление аккаунта | Шаг 6: учитель сам удаляет свой аккаунт; суперадмина нет |
| 10 | Параллельный и потерянный refresh | Только фронт: один refresh за раз (single-flight между вкладками); серверного окна нет; повторное использование refresh удаляет только семью этого токена, а не все токены учителя |
| 11 | Захват регистрации первым | Снят в ревизии 4 |

## 10. Открытые вопросы к пользователю (история; решения — в 10а)

1. **Имя учителя.** В `Teacher` нет `name`. Оставляем без имени (минимум данных) или добавляем `displayName`?
2. **Шаг 1 без писем.** С ревизии 3 учитель создаётся только при подтверждении (1.2а), поэтому без писем шаг 1 проверить нельзя. Варианты: (а) объединить шаги 1 и 2 — **рекомендую**; (б) в `development` заглушка пишет ссылку в консоль (нарушает «токены не в логах», только локально); (в) в dev скрипт активирует ожидающую регистрацию.
3. **Refresh не JWT.** Согласны поправить `docs/architecture.md:374`?
4. **Лимиты.** Стартовые числа из 1.6 подходят? Особенно: (а) лимит неудачных входов **на email** (защищает пароли от 4 символов от распределённого перебора, но посторонний может временно заблокировать вход учителю; альтернатива — нарастающая задержка); (б) бюджеты писем: 3 в час и 5 в сутки отдельно для регистрации и для сброса (итого ≤ 10 писем в сутки на адрес). **Осознанный риск:** посторонний, отправив 5 запросов в сутки на чужой адрес, исчерпывает его бюджет — учитель до конца суток не получит письмо подтверждения или сброса (ответ при этом общий, учитель не узнает причину). Обход — вход через Google (шаг 4); принимаем ради защиты репутации домена и от спама; (в) `MAX_TRACKED_KEYS` и `MAX_PENDING_HASH_JOBS` — подобрать нагрузочной проверкой перед деплоем.
5. ~~Caddy и `/api`~~ — **закрыт решением тимлида:** Hono всегда на `/api/auth`, Caddy не срезает префикс, в dev `nitro.devProxy` (1.7, 1.7а). Остаётся подтвердить у пользователя: нужен ли вход с телефона в локальной сети — тогда локальный Caddy с `tls internal` (1.7а).
6. ~~Неподтверждённые аккаунты~~ — **снят:** неподтверждённых учителей нет; `PendingRegistration` живёт `PENDING_REGISTRATION_TTL_MS` (24 ч) и удаляется cleanup'ом (1.2а).
7. **Сроки.** Access 15 мин; refresh 30 дней скользящий; **абсолютный срок сессии** 30 дней с входа; до 5 сессий. Для общих компьютеров в классе, может, короче (7–14 дней) и кнопка «выйти на всех устройствах»?
8. **Google.** `fetch` + `jose` (без новой зависимости) или `google-auth-library` 11.3.3?
9. **Удаление аккаунта.** Шаг 6 сразу после шага 4 или раньше?
10. **Параллельный и потерянный refresh.** Два сценария, когда честный клиент предъявляет уже ротированный токен:
    - две вкладки обновляются одновременно — закрывается single-flight на фронте между вкладками (раздел 5);
    - **ответ на ротацию потерялся** (мобильная сеть, школьный Wi-Fi): сервер уже выдал новый токен, клиент его не получил, повторяет запрос со старым → срабатывает reuse-detection → учитель выходит со всех устройств. Фронт это не закрывает.
    Варианты: (а) без окна — строго, но потеря ответа = выход на этом устройстве (удаляется только семья токена); (б) короткое окно `REFRESH_REUSE_GRACE_MS` (несколько секунд): если предъявлен непосредственно предыдущий токен семьи, а его преемник ещё **ни разу не использован**, сервер отзывает преемника и выдаёт новый токен той же семьи вместо отзыва всех сессий. «Вернуть тот же токен» нельзя — в БД только HMAC. Риск (б): украденный токен, предъявленный в пределах окна, раньше честного клиента, не будет обнаружен, а честный клиент потом вызовет reuse и всё равно отзовёт сессии. Решение — за пользователем.
11. ~~Захват регистрации первым~~ — **снят** в ревизии 4: на email может быть несколько ожидающих регистраций, «первая запись» никого не блокирует (1.2а).

---

## 11. Находки reviewer → где закрыто

Отчёт: `.claude/reviews/natsdoll-auth-port.md` — первая часть (перенос NatsDoll, H/M/L) и вторая часть (проверка ревизии 2, R-находки).

| # | Уровень | Находка | Где закрыто |
|---|---|---|---|
| H1 | high | Rate limit верит `X-Real-IP`/`X-Forwarded-For`, общий ключ `'unknown'` | 1.3 (`TRUSTED_PROXY_IPS`), 1.6, тест в 1.6 и 1.9; доработано в R2 |
| H2 | high | Секреты и `Secure` из сырого `process.env`, нет минимальной длины, откат HMAC на JWT, `FRONTEND_URL` по умолчанию | 0 (Конфиг), 1.3, 1.5 (`tokenService`), 1.7 (`Secure` всегда), 2 и 4 (env Resend/Google) |
| H3 | high | Email и пароль нормализуются не везде | 1.4 (`emailSchema` во всех точках, `loginPasswordSchema`, тесты), 3, 4 (email Google) |
| H4 | high | Prisma в application, presentation импортирует infrastructure | 0 (Слои), 1.5 (`types.ts`, P2002/P2025 в репозитории, `makeAuthRouter(deps)`), 1.9 (проверка импортов), 4 (Google URL из `app.ts`) |
| H5 | high | Модель `name`/`role`/гости, ветка гостевого сброса, `requireAdmin` из JWT | 0 (Пользователь, Роль), 1.2а (учитель только при подтверждении), 1.5 (`requireAdmin` не переносим), 3 (нет ветки гостей), 7 |
| M1 | medium | Cookie `Path=/`, без префикса, `secure` по условию | 1.7 (`__Secure-refresh_token`, `Path=/api/auth`, `Secure` всегда, `deleteCookie` с теми же опциями); работа в dev — R1, R4 |
| M2 | medium | Объекты ошибок целиком в логах | 1.5 (`register`), 2 (Resend), 4 (Google), 8 п.7, 1.9 |
| M3 | medium | Токены подтверждения и сброса в query | 2 (фрагмент + `Referrer-Policy`), 3, 5 (`replaceState`) |
| M4 | medium | Старые ссылки сброса не отзываются, нет лимита писем на email | 3 (`deleteMany` перед созданием и при finalize), 1.6 и 3 (раздельные бюджеты, доработано в V2) |
| M5 | medium | Лимит только по IP (школьный NAT, распределённый перебор), нет `Retry-After` (доработано в R3) | 1.6 (ключи IP+email / IP / email, `Retry-After`, константы), 1.5 (`errorHandler` переносит заголовки); числа и блокировка по email — **решение пользователя** (вопрос 4) |
| M6 | medium | `googleapis`, нет PKCE, nonce, `id_token` | 1.1, 4; выбор библиотеки — **решение пользователя** (вопрос 8) |
| M7 | medium | Reuse-detection ослабляется при входе, нет абсолютного срока, параллельный refresh (потерянный ответ — R6) | 1.2 (`familyId`, `familyExpiresAt`), 1.5 (не чистить отозванные при входе, удалять семьи), cleanup, 1.9, 5 (single-flight между вкладками); серверное окно — **решение пользователя** (вопрос 10) |
| M8 | medium | `zod/v3` и `zValidator` с `as never` | 0 (Валидация), 1.1, 1.5 (не переносим, `readJsonBody`) |
| M9 | medium | Нет удаления аккаунта (GDPR) | 6 (шаг 6); сроки — **решение пользователя** (вопрос 9), каскады закладываются в 1.2/3 |
| L1 | low | `randomUUID()` (122 бита) | 1.5 (`tokenService`: `randomBytes(32)`), 8 п.13 |
| L2 | low | JWT без `iss`/`aud`/`typ`, `role as string` | 1.5 (`tokenService`: `typ: 'at+jwt'`, `iss`, `aud`, Zod-разбор payload, без роли), 1.9 |
| L3 | low | Неверный текущий пароль → 401 | 3 (`changePassword` → 400), 5 |
| L4 | low | Магические числа, длинные комментарии, 10 позиционных параметров | 1.5 (общие правила, `makeAuthRouter(deps)`), 1.6 (константы), 7 |
| L5 | low | `docs/architecture.md:374` называет refresh JWT | 9; **решение пользователя** (вопрос 3) |
| L6 | low | Пароль при входе без `max` | 1.4 (`loginPasswordSchema.max(MAX_PASSWORD_LENGTH)`) |
| — | dep | `@node-rs/argon2`: параметры явными константами, тест dummy-хэша | 1.1, 1.5 (`passwordHasher`, `ARGON2_OPTIONS`, тест) |
| — | dep | `@hono/node-server` 2.x: `conninfo` | 1.1 (экспорт проверен, поведение — тестом) |
| — | dep | `resend`: changelog за 25 минорных версий | 1.1, 2 |
| R1 | high | `Path=/api/auth` ломает refresh в dev и тестах без Caddy | шапка (единая схема путей), 1.7 (Hono всегда на `/api/auth`, Caddy не срезает — вопрос 5 закрыт тимлидом), 1.7а (`nitro.devProxy`), 1.8, 4 (`GOOGLE_REDIRECT_URI`), 5 (относительный `/api`), 1.9 (refresh в настоящем браузере, Playwright) |
| R2 | medium | `TRUSTED_PROXY_IPS`: `::ffff:`, пустой список в production, IP Caddy меняется, `X-Real-IP` не IP | 1.3 (Zod IP/CIDR, обязателен в production, `BlockList`, статический IP Caddy в compose), 1.6 (нормализация `::ffff:`, `net.isIP` для `X-Real-IP`, тесты), 1.9, 9 |
| R3 | medium | Лимиты по email: ключ до нормализации, гонка счётчика неудач, рост `Map` | 1.6 (проверка после `readJsonBody` по `emailSchema`, `tryReserve` до `verify` + `release`, `MAX_TRACKED_KEYS` с вытеснением, одинаковый 429), 1.5 (`login`), 1.9 |
| R4 | medium | `Secure` всегда: телефон по LAN, WebKit на localhost | 1.7 (`Secure` без флага отключения), 1.7а (devProxy на `localhost`; телефон — локальный Caddy `tls internal`/mkcert), 1.9 (WebKit-проект Playwright или ручная проверка Safari, результат записывается в критерий); вход с телефона в LAN — **решение пользователя** (вопрос 5) |
| R5 | medium | Захват аккаунта до подтверждения (перезапись пароля, привязка Google к паролю атакующего) | 1.2а (`PendingRegistration`, учитель создаётся при подтверждении, подтверждение с паролем, повторная регистрация не перезаписывает), 1.5 (`register`, `verifyEmail`), 1.9, 4 (привязка Google: отбросить пароли ожидающих регистраций; ветка сброса пароля для варианта без `PendingRegistration`), 8 п.17; DoS «первой записью» снят в V1 |
| R6 | low | Потерянный ответ refresh = выход со всех устройств | вопрос 10 (сценарий и вариант окна с риском), 5 (клиент не повторяет refresh автоматически); **решение пользователя** |
| R7 | low | Длина секрета в байтах; доступ после удаления аккаунта | 1.3 (`Buffer.byteLength`, `MIN_SECRET_BYTES`), 1.5 (`getMe` и все use-case-ы за `requireAuth` → 401), 3 (`changePassword`), 6, 1.9, 8 п.18 |
| V1 | medium | «Первая запись действует» и `email @unique` дают DoS регистрации | 1.2а (без `@unique`, `@@index([email])`, своя запись на каждую регистрацию, удаление всех записей email при подтверждении, письма-предупреждения нет), 1.5, 1.9, 2, 4; вопрос 11 снят |
| V2 | medium | Общий `EMAILS_PER_ADDRESS` блокирует письма сброса, 72 письма в сутки | 1.6 (`REGISTRATION_EMAILS_PER_ADDRESS`, `RESET_EMAILS_PER_ADDRESS`, суточные потолки по назначению, ≤ 10 в сутки на адрес, тест), 2, 3; числа — вопрос 4 |
| V3 | medium | Вытеснение самых старых ключей сбрасывает счётчик жертвы | 1.6 (истёкшие → наименьший счётчик; ключи у порога не вытесняются; поведение при полной Map; тест с 19 неудачами) |
| V4 | low | Перечисление email по времени `register` | 1.2а, 1.5 (`hash` первым шагом во всех ветках), 3 (то же для сброса), 1.9 (unit-тест) |
| V5 | low | `BlockList.check` с неверным семейством / пробел в `X-Real-IP` | 1.6 (семейство из `net.isIP`, `trim()`, тест обоих видов адреса) |
| V6 | low | Двойной `verify-email`; `release` после смены окна | 1.2а и 1.5 (CAS `deleteMany` + `count === 1` до создания `Teacher`), 1.6 (резерв с меткой окна), 1.9, тесты в 1.6 |
| V7 | low | Неограниченная очередь argon2 | 1.6 (`MAX_PENDING_HASH_JOBS`, 503 + `Retry-After`, учитываются и dummy-хэши), 1.9, 8 п.19; число — вопрос 4 |
| V8 | medium | Лимиты в e2e; выбор лимитов по `NODE_ENV` ослабил бы production при ошибке в env | 1.6 (`src/index.ts` всегда `PRODUCTION_LIMITS`; `TEST_LIMITS` только из тестов; e2e — `tests/e2e/server.ts`, исключён из образа через `Dockerfile`/`.dockerignore`; `reset()` в unit/интеграционных; уникальные email), 1.3 (`WEB_ORIGIN=https://` при `NODE_ENV !== 'production'` → отказ старта), 1.9 |
| V9 | low | 503 очереди хэширования расходует лимит неудач | 1.6 (`hasCapacity()` до `tryReserve`, `release` при 503 после резерва), 1.9 (тест) |
| V10 | low | 5 запросов в сутки на чужой адрес исчерпывают бюджет писем | вопрос 4 (осознанный риск, обход — вход через Google); **решение пользователя** |
