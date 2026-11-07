# План: фронтенд авторизации (шаг 5, часть 1 — вход и регистрация)

Дата: 2026-11-06. Статус: **черновик, ждёт ответов пользователя** (раздел 8).
API готов (шаги 1–4, коммит 91612be): маршруты `/api/auth/*`, refresh в cookie `__Secure-refresh_token` (`Path=/api/auth`),
access-токен в теле ответа. План бэкенда — `.claude/plans/auth-port.md` (разделы 1.7, 1.7а, 5).

---

## 1. Что уже есть в `apps/web` (не дублируем)

| Что | Где | Как используем |
|---|---|---|
| Nuxt 4.6.3, SSR, алиас `@` → `src`, `app/pages` тонкие, страницы в `src/pages` | `nuxt.config.ts`, `app/pages/*.vue` | Новые страницы по тому же образцу: `app/pages/auth/login.vue` → `@/pages/LoginPage.vue` + `definePageMeta` |
| ФСД: `widgets/` (8 слайсов), `features/` и `entities/` пустые, `shared/{ui,lib,config,nat,api}` | `src/` | Первые слайсы в `features/` и `entities/` |
| ESLint `no-restricted-imports` против deep imports | `eslint.config.mjs` | Каждый новый слайс — с `index.ts` |
| `AppButton` (оранжевая/синяя, `to` → ссылка), `AppLogo`, `TwinklingStars` | `src/shared/ui` | Кнопки форм — `AppButton`, но ему нужен `type="submit"` и `disabled` (сейчас всегда `type="button"`) — **расширить**, не копировать |
| Маскот Нат: `NatRobot`, `NatFigure`, 12 сцен | `src/shared/nat` | Только **использовать** готовые компоненты, анимации не менять |
| Цвета, шрифты, z-index, `--gutter` | `src/assets/styles/global.scss`, `@nuxt/fonts` (Unbounded, Onest) | Только переменные `--color-*` и каналы `--rgb-*` |
| Брейкпоинты `@include tablet/desktop` | `src/assets/styles/breakpoints.module.scss` | Mobile-first: в этой части **без** tablet/desktop |
| Layout `default` (шапка, предфутер, футер) | `app/layouts/default.vue` | Для `/auth/**` — см. вопрос 2 |
| Ссылки «Войти» и «Зарегистрироваться» в шапке и футере | `src/shared/config/siteLinks.ts` | Сейчас `href: '/login'`, `'/register'` → заменить на `to: '/auth/login'`, `'/auth/register'` (адреса задаёт API: письма и редиректы ведут на `/auth/*`) |
| Страница `/nat` (только dev) | `app/pages/nat.vue`, хук `pages:extend` | Не трогаем |
| Vitest (unit + nuxt-окружение), Playwright (Chromium desktop + Pixel 7) | `vitest.config.ts`, `playwright.config.ts` | Добавить проект **WebKit** для cookie-цепочки (раздел 6) |

**Чего нет и что нужно добавить:**
- **Pinia** не установлен (`package.json` — только `nuxt`, `vue`). По правилам проекта store в `auth/` обязателен → новая зависимость `@pinia/nuxt` 1.0.3 (+ `pinia` 4.1.0). Перед установкой — проверка по CLAUDE.md (`npm view`, advisories, `npm audit` после). **Вопрос 1.**
- **`nitro.devProxy`** `/api` → `http://127.0.0.1:3001/api` (план 1.7а) — только в dev, в сборку не попадает.
- **`routeRules`**: `/auth/**` — `ssr: false` (план, `docs/architecture.md`).
- `src/shared/api/` пуст — сюда HTTP-клиент.

## 2. Структура (ФСД)

```
src/shared/api/          apiClient.ts — fetch к /api с credentials: 'include', разбор { error, issues },
                         ApiError(status, issues); без токенов в логах. index.ts
src/entities/teacher/    types.ts — TeacherView из ответа API (z.infer нет: схемы ответов в shared ещё не описаны,
                         см. вопрос 5). index.ts
src/features/auth/       store.ts (Pinia: accessToken в памяти, teacher, статус сессии)
                         authApi.ts (login, register, verifyEmail, refresh, logout, googleLink)
                         useSessionRefresh.ts (single-flight refresh между вкладками)
                         useTokenFromHash.ts (читает #token=, сразу history.replaceState)
                         authErrors.ts (статус/контекст → русский текст)
                         components/: LoginForm, RegisterForm, VerifyEmailForm, LinkGoogleForm, GoogleButton,
                         FormField (поле с label/ошибкой), PasswordField (показать/скрыть)
                         index.ts
src/widgets/auth-card/   AuthCard.vue — карточка формы с Натом и заголовком. index.ts
src/pages/               LoginPage, RegisterPage, VerifyEmailPage, GoogleCallbackPage, LinkGooglePage
app/pages/auth/          login.vue, register.vue, verify-email.vue, callback.vue, link-google.vue — тонкие
```

Схемы ввода — из `@nataskium/shared/schemas` (`loginSchema`, `registerSchema`, `verifyEmailSchema`, `googleLinkSchema`):
клиентская проверка для подсказок, сервер проверяет снова. Константы (`MIN_PASSWORD_LENGTH`, `DISPLAY_NAME_MAX_LENGTH`) — оттуда же.

## 3. Страницы

Тексты ошибок — по-русски на фронте (`authErrors.ts`) по статусу и контексту, а не текст API (он английский
и намеренно общий). Одинаковый 400/401 → одинаковый текст.

| Маршрут | Состояния | Что отправляется | Что сохраняется |
|---|---|---|---|
| **`/auth/login`** | форма; отправка (кнопка заблокирована); 401 → «Неверная почта или пароль»; 429 → «Слишком много попыток, попробуйте через N мин» (`Retry-After`); 503 → «Сервер занят, попробуйте позже»; 400 (Zod) → подсказки у полей; `?error=google_*` из редиректа Google → понятный текст по коду | `POST /api/auth/login { email, password }` | `accessToken`, `teacher` в store; refresh — cookie (ставит API). Переход на `?next=` (только внутренний путь) или главную кабинета |
| **`/auth/register`** | форма (email, пароль, имя — необязательное); отправка; 202 → экран «Проверьте почту» (тот же для любого email, адрес не повторяем — анти-перечисление); 400 (Zod) → подсказки; 429 | `POST /api/auth/register { email, password, displayName? }` (пустое имя не отправляется) | Ничего |
| **`/auth/verify-email`** | токен из `#token=` → сразу `replaceState`; нет токена → «Ссылка неполная, откройте письмо ещё раз»; форма пароля («введите пароль, который вы задали»); 400 → «Ссылка недействительна или пароль неверный» (один текст); 409 → «Аккаунт уже есть — войдите»; 429; успех → вход | `POST /api/auth/verify-email { token, password }` | Токен — только в памяти компонента до отправки; после успеха — сессия в store |
| **`/auth/callback`** | «Входим…» → `POST /api/auth/refresh` → успех: сессия, переход; 401 → на `/auth/login?error=google_failed` | `POST /api/auth/refresh` (cookie, поставленная callback API) | Сессия в store |
| **`/auth/link-google`** | токен из `#token=` → `replaceState`; объяснение «У вас уже есть аккаунт с этой почтой — введите пароль, чтобы связать его с Google»; 400 → «Неверный пароль или ссылка устарела» (один текст); 409 → «Этот Google-аккаунт нельзя связать»; 429; успех → вход | `POST /api/auth/google/link { token, password }` (+ cookie `__Secure-google_link` ставит браузер сам) | Сессия в store |

Кнопка «Войти через Google» — обычная ссылка `href="/api/auth/google/start"` (полный переход, не fetch), на `/auth/login` и `/auth/register`.
Сброс пароля (`/auth/forgot`, `/auth/reset-password`) — следующая часть шага 5 (вопрос 6).

## 4. Сессия

- **Store** (`features/auth/store.ts`): `accessToken` — **только в памяти** (не `localStorage`, не `sessionStorage`, не cookie); `teacher`; `status: 'unknown' | 'authenticated' | 'anonymous'`.
- **При загрузке приложения** (плагин `client` или первый вызов guard): один `POST /api/auth/refresh` → `{ accessToken, teacher }` или 401 → `anonymous`.
- **Обновление токена**: access живёт 15 мин; при 401 от API — один refresh и повтор запроса. Заранее (за 1 мин до `exp`) не обновляем в первой версии — проще; можно добавить.
- **Один refresh одновременно между вкладками** (решение пользователя, сервер окна не даёт):
  - `navigator.locks.request('nataskium-refresh', …)` — refresh внутри блокировки; внутри вкладки — single-flight через общий промис;
  - после refresh вкладка рассылает новый `accessToken` через `BroadcastChannel('nataskium-auth')`; вкладка, ждавшая блокировку, сначала смотрит, не пришёл ли токен, и refresh не повторяет — иначе вторая вкладка предъявила бы уже ротированный токен и выбила бы сессию (reuse detection);
  - выход (`logout`) — тоже через канал, остальные вкладки очищают store;
  - Web Locks и BroadcastChannel есть в Safari 15.4+ / 16.4+; без них — single-flight только внутри вкладки (вопрос 4).
- **Потерянный ответ refresh** (план, вопрос 10): автоматически не повторяем — 401 → вход заново.
- **Токены из URL**: `#token=` читается при монтировании и сразу убирается `history.replaceState(null, '', location.pathname)`; в store/логи/аналитику не попадает.
- **Guard** для будущего `/teacher/**` — middleware Nuxt по `status` (в этой части не нужен).

## 5. Дизайн

- Цвета `docs/brand-colors.md` через `var(--color-*)` и `rgb(var(--rgb-*) / a)`; статичные — hex; `rgba()` запрещён.
- Заголовки — Unbounded (`--font-display`), текст — Onest (`--font-body`).
- Нат — готовый компонент из `shared/nat` (какая сцена — вопрос 3), анимации не менять.
- **Mobile-first**, только мобильная вёрстка (memory): tablet/desktop — по запросу.
- BEM в `<style scoped lang="scss">`, блок = имя файла (`LoginForm.vue` → `.login-form`); `@use '@/assets/styles/breakpoints.module' as *;`.
- Основная кнопка формы — оранжевая `AppButton` (контраст 2.52:1 принят пользователем, memory `orange-button-contrast`).
- Доступность: `<label for>`, `aria-describedby` на текст ошибки, `aria-live="polite"` для общей ошибки формы, фокус на первое поле с ошибкой, `prefers-reduced-motion`.
- Вёрстку делает `ui-designer` (команда CLAUDE.md), логику — `vue-expert`/я.

## 6. Безопасность

- Без `v-html`; все тексты — интерполяцией.
- Пароль и токены — не в `localStorage`/`sessionStorage`/URL query, не в логах и не в Pinia-devtools в production (store не хранит пароль вообще).
- Поля: `type="email"`, `autocomplete="email"`; пароль — `autocomplete="current-password"` (вход, подтверждение, link-google) и `"new-password"` (регистрация); `inputmode`, `spellcheck="false"`, `autocapitalize="off"`.
- `?next=` — только внутренний путь (начинается с `/`, не `//`), иначе открытый редирект.
- Запросы к API — относительные `/api/...` (same-origin; в dev — devProxy); `credentials: 'include'`.
- `Referrer-Policy: no-referrer` для `/auth/**` и CSP — в Caddyfile (задача деплоя), в коде не настраиваем; ничего, что сломает CSP: без inline-скриптов и `eval`.
- Страницы `/auth/**` — `ssr: false`: токены не попадают в HTML и кэш.

## 7. Тесты

- **Unit (Vitest)**: store (установка/сброс сессии); `useSessionRefresh` — single-flight в вкладке, Web Locks/BroadcastChannel (фейки), токен от другой вкладки отменяет свой refresh, 401 → `anonymous`; `useTokenFromHash` — чтение и `replaceState`; `authErrors` — статусы → тексты; `apiClient` — разбор `{ error, issues }`, `Retry-After`.
- **e2e (Playwright)**:
  - регистрация → письмо → подтверждение → вход: через **настоящий API** на `db-test` (отдельная точка входа `apps/api/tests/e2e/server.ts` с `TEST_LIMITS` и фейковым `EmailSender`, который отдаёт токен тесту — по плану 1.6) — так проверяется настоящая cookie-цепочка; альтернатива — `page.route` с фейковым API (вопрос 7);
  - Google: callback API с фейковым провайдером → `/auth/callback` → refresh — в **Chromium и WebKit** (замечание reviewer: Safari и `__Secure-` cookie на `http://localhost`); результат записать в критерий плана бэкенда 1.9;
  - `/auth/link-google` без cookie `__Secure-google_link` → тот же текст ошибки;
  - после загрузки страницы токен исчез из адресной строки;
  - две вкладки обновляются одновременно — сессия не теряется.

## 8. Открытые вопросы к пользователю

1. **Pinia** — ставим `@pinia/nuxt` 1.0.3 (обязателен по правилам для `auth/`)? Рекомендую да; перед установкой проверю advisories и `npm audit`.
2. **Layout для `/auth/**`**: общий (шапка + футер с ночным городом) или облегчённый (только логотип, карточка формы, Нат)? Рекомендую облегчённый: меньше отвлекает, быстрее на телефоне.
3. **Нат на страницах входа** — какая сцена (например, `NatTeacher` на входе, `NatCards`/`NatBulb` на регистрации) или один `NatRobot`? Рекомендую одного `NatRobot` на всех auth-страницах.
4. **Старые браузеры без Web Locks** (Safari < 15.4, школьные iPad): достаточно single-flight внутри вкладки? Рекомендую да — две вкладки на старом iPad редкость, худший исход — повторный вход.
5. **Схемы ответов API в shared** (`authSessionSchema`, `teacherViewSchema`) — добавить, чтобы фронт получал типы через `z.infer`? Рекомендую да (маленькая правка в `packages/shared`).
6. **Сброс пароля** (`/auth/forgot`, `/auth/reset-password`) — в этой же части или следующей? Рекомендую следующей: эта и так большая.
7. **e2e регистрации** — настоящий API на `db-test` или фейковый API в браузере? Рекомендую настоящий: проверяет cookie и CORS по-настоящему; фейковый — только для редких ошибок (429, 503).
8. **Язык ошибок** — русский на фронте по статусу (API отвечает по-английски и намеренно общо). Рекомендую так; позже — через i18n.
