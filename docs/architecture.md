# Nataskium — Архитектура проекта

**Версия:** 0.1 (план, кода ещё нет)
**Дата:** 2026-10-19

---

## Обзор

Nataskium — интернациональная SaaS-платформа создания обучающих игр и интерактивных заданий для учителей, аналог Wordwall и Blooket. Главное отличие — **школьные оценки**: в конце игры ученик видит на своём экране оценку по шкале, выбранной учителем. В первой версии результаты **нигде не сохраняются** — учитель узнаёт оценку от ученика. Маскот платформы — робот **Нат**.

Проект использует **Feature-Sliced Design (ФСД)** для структурирования фронтенда.

**Правило импортов:** только сверху вниз — `pages` → `widgets` → `features` → `entities` → `shared`. Импорт снизу вверх запрещён. Deep imports запрещены — всегда через `index.ts`.

---

## Стек технологий

| Слой        | Технология                              |
| ----------- | --------------------------------------- |
| Frontend    | Nuxt 4 (Vue 3, SSR) + Pinia + TS + SCSS |
| Backend     | Hono + TypeScript + Node.js             |
| БД          | PostgreSQL + Prisma ORM                 |
| Shared      | npm workspaces + Zod + TS               |
| Auth        | JWT + Google OAuth                      |
| Изображения | Яндекс Object Storage (S3)              |
| Платежи     | PayPal REST API                         |
| Рассылка    | Resend                                  |
| Тесты       | Vitest + Playwright                     |
| Deploy      | VPS + Docker Compose                    |

---

## Структура проекта

```
Nataskium/
├── apps/
│   ├── api/              ← Hono backend
│   │   ├── src/
│   │   │   ├── features/ ← бизнес-логика (auth, assignments, grading-scales, play, etc)
│   │   │   ├── shared/   ← общие слои (errors, middleware, utils, infrastructure)
│   │   │   └── app.ts    ← composition root (инжекция зависимостей)
│   │   ├── prisma/       ← ORM, миграции, schema
│   │   └── tests/
│   │
│   └── web/              ← Nuxt 4 frontend (SSR)
│       ├── app/             ← слой Nuxt (вне ФСД)
│       │   ├── pages/       ← file-based роутинг, тонкие файлы-адреса
│       │   ├── layouts/     ← макеты страниц
│       │   ├── app.vue      ← корень приложения
│       │   └── error.vue    ← страница ошибок (404 / 5xx)
│       ├── src/             ← слои ФСД (алиас `@`)
│       │   ├── pages/       ← страницы ФСД ({Name}Page.vue)
│       │   ├── widgets/     ← самодостаточные блоки с логикой
│       │   ├── features/    ← действия пользователя
│       │   ├── entities/    ← бизнес-сущности
│       │   └── shared/      ← UI-примитивы, утилиты, Нат
│       ├── nuxt.config.ts   ← конфиг (routeRules: SSR/CSR)
│       └── tests/
│           └── e2e/         ← Playwright тесты
│
├── packages/
│   └── shared/           ← npm workspace
│       ├── schemas/      ← Zod валидация
│       ├── types/        ← TS типы
│       ├── enums/        ← GradingScaleType (string enums)
│       └── grading/      ← расчёт оценки по шкале (общий для api и web)
│
├── docs/                 ← документация
└── package.json          ← npm workspaces
```

---

## ФРОНТЕНД: ФСД слои

### Рендеринг (Nuxt SSR)

Рендеринг — это то, **где собирается страница**: на сервере или в браузере.

- **SSR (Server-Side Rendering)** — сервер собирает готовую страницу с текстом и отдаёт её браузеру. Человек и Google сразу видят содержимое → страница хорошо находится в поиске
- **CSR (Client-Side Rendering)** — сервер отдаёт почти пустую страницу и программу, браузер сам собирает экран и подгружает данные. Подходит для закрытых и интерактивных экранов, которые Google всё равно не индексирует

Гибридная стратегия (часть адресов SSR, часть CSR) через `routeRules` в `nuxt.config.ts`:

- **SSR** — публичные страницы (лендинг, тарифы, каталог готовых игр) ради SEO
- **CSR (`ssr: false`)** — приватные и интерактивные: `/teacher/**` (кабинет учителя), `/play/**` (игра ученика по ссылке), `/auth/**`

```ts
routeRules: {
  '/teacher/**': { ssr: false },
  '/play/**': { ssr: false },
  '/auth/**': { ssr: false },
}
```

`**` — этот адрес и всё, что после него (`/teacher/assignments`, `/teacher/scales`, …).

### Роутинг: `app/pages` + `src/pages`

Роутинг — правило «какой адрес открывает какую страницу». В Nuxt он строится **по файлам**: `app/pages/assignments.vue` автоматически становится адресом `/assignments`. У ФСД тоже есть слой `pages`, поэтому папок две, с разными задачами:

| Папка        | Что делает                                                  | Пример                      |
| ------------ | ----------------------------------------------------------- | --------------------------- |
| `app/pages/` | только **адрес**: «на `/assignments` показать эту страницу» | `assignments.vue`, 3–4 строки |
| `src/pages/` | сама **страница** ФСД, собранная из виджетов                | `AssignmentsPage.vue`       |

Весь настоящий код живёт в `src/` по правилам ФСД, а `app/pages/` — «таблица адресов». Так же устроен NatsDoll (`app/pages/cart.vue` → `src/pages/CartPage.vue`).

Файл в `app/pages/` тонкий: импорт страницы из `src/pages` + `definePageMeta` (имя адреса для ссылок), без логики:

```vue
<template>
  <AssignmentsPage />
</template>

<script setup lang="ts">
import AssignmentsPage from '@/pages/AssignmentsPage.vue'

definePageMeta({ name: 'assignments' })
</script>
```

Папки `app/components/` нет — автоимпорт компонентов Nuxt не используется, все компоненты импортируются явно.

### Слои (сверху вниз)

| Слой       | Назначение                                                    | Примеры                                   |
| ---------- | ------------------------------------------------------------- | ----------------------------------------- |
| `pages`    | Страницы ФСД в `src/pages/`, собирают виджеты                 | AssignmentsPage, PlayPage                 |
| `widgets`  | Самодостаточные блоки со своей логикой и состоянием           | QuestionEditor, GameStage, ResultScreen   |
| `features` | Действия пользователя (бизнес-операции)                       | CreateAssignment, JoinByLink, SubmitAnswer, ChooseScale |
| `entities` | Бизнес-сущности                                               | Assignment, Question, GradingScale, Teacher |
| `shared`   | UI-примитивы без бизнес-логики, утилиты, персонаж Нат         | AppButton, AppLogo, NatRobot              |

### Структура слайса (widgets / features / entities)

```
{layer}/{sliceName}/
├── {SliceName}.vue             главный компонент
├── components/                 (опционально) если подкомпонентов 2+
│   └── SubComponent.vue
├── use{SliceName}.ts           (опционально) composable с логикой
├── {sliceName}Api.ts           (опционально) HTTP запросы
├── store.ts                    (опционально) Pinia store
├── types.ts                    (опционально) если тип используется в 2+ файлах
├── {sliceName}.test.ts         unit-тесты рядом с кодом
└── index.ts                    ОБЯЗАТЕЛЕН — публичный API
```

### Структура shared (фронтенд)

```
shared/
├── ui/              Vue компоненты-примитивы (AppButton, AppLogo, etc)
├── nat/             Нат — NatFigure, NatRobot, сцены, общая физика
├── lib/             утилиты и helpers
├── api/             базовый HTTP-клиент
├── config/          константы, env
└── index.ts         экспортирует публичный API
```

### Тесты

Unit-тесты живут **рядом с компонентом** в том же слайсе:

```
widgets/result-screen/
├── ResultScreen.vue
├── ResultScreen.test.ts   ← рядом
└── index.ts
```

E2e-тесты (Playwright) — в `tests/e2e/`, так как тестируют приложение целиком.

### Правильные и неправильные импорты

```typescript
// ✓ ПРАВИЛЬНО — через index.ts, направление сверху вниз
import { ResultScreen } from '@/widgets/result-screen'
import { GradingScale } from '@/entities/grading-scale'
import { AppButton } from '@/shared'

// ✗ ЗАПРЕЩЕНО — deep imports
import ResultScreen from '@/widgets/result-screen/ResultScreen.vue'
import { assignmentApi } from '@/entities/assignment/assignmentApi'

// ✗ ЗАПРЕЩЕНО — импорт снизу вверх
import { GameStage } from '@/widgets/game-stage'  // из entities
```

ESLint правило `no-restricted-imports` проверяет и запрещает deep imports.

### Где используется Pinia store

**Store обязателен в:**

- `auth/` — сессия учителя
- `assignment-editor/` — состояние редактора задания (вопросы, настройки, шкала)
- `play/` — прогресс ученика в игре (текущий вопрос, ответы)

**Store опционален в:**

- `assignments/` — список заданий учителя
- `grading-scales/` — шкалы учителя

### CSS и стили

Стили пишутся в `<style scoped lang="scss">` компонента, используется **BEM нотация**.
Глобальные стили — в `src/assets/styles/`:

```
assets/styles/
├── breakpoints.module.scss ← миксины tablet / desktop
└── global.scss             ← CSS-переменные в :root (цвета бренда, шрифты, z-index, layout), сброс и базовые стили
```

**Бренд:** цвета — из `docs/brand-colors.md`; шрифты — **Unbounded** (только короткие заголовки: логотип, таймер, оценка) и **Onest** (весь остальной текст, вопросы, варианты ответов).

**Правила CSS:**

- Цвета с прозрачностью — `rgb(r g b / alpha)`, никогда `rgba(r, g, b, alpha)`
- Статичные цвета — hex (`#4573F4`), прозрачные — через CSS-переменные с каналами (`rgb(var(--brand-blue) / 0.2)`)
- Адаптив — только миксины `@include tablet` / `@include desktop`
- Z-index — каскадом через `calc()`:

```scss
--z-stage: 0;
--z-stage-overlay: calc(var(--z-stage) + 1);
--z-header: 10;
--z-modal: calc(var(--z-header) + 1);
```

---

## БЭКЕНД: Clean Architecture (упрощённая)

### Структура фичи — 3 слоя

```
features/{featureName}/
├── application/                    бизнес-логика (use-cases)
│   ├── createAssignment.ts
│   ├── checkAttempt.ts
│   └── getAssignmentForPlay.ts
├── infrastructure/                 работа с БД (репозитории)
│   └── {featureName}Repository.ts
├── presentation/                   HTTP маршруты (Hono)
│   └── {featureName}Routes.ts
└── index.ts                        публичный API
```

### Application слой

Содержит бизнес-логику в виде use-cases. Один файл = одна операция. Use-case — **фабрика** `make…`, которая принимает зависимости и возвращает функцию операции:

```typescript
// features/play/application/checkAttempt.ts
export function makeCheckAttempt(repo: PlayRepository) {
  return async function checkAttempt(shareToken: string, answers: Answer[]) {
    const assignment = await repo.findAssignmentByToken(shareToken);
    if (!assignment) throw new AppError(404, "Assignment not found");

    const percent = calculatePercent(assignment.questions, answers);
    const grade = assignment.gradingScale ? gradeByScale(percent, assignment.gradingScale) : null;

    return { percent, grade };
  };
}
```

**Правила:**

- Один файл на одну операцию (не один большой сервис)
- Получает репозиторий и другие зависимости через `make…`-фабрику (инжекция зависимостей)
- Работает с Prisma-моделями напрямую
- Не зависит от Hono или других фреймворков

### Infrastructure слой

Работает с БД через Prisma. Репозиторий — **фабрика** `make…Repository(prisma)`, возвращающая объект с методами (тип описан в `types.ts`):

```typescript
// features/play/infrastructure/playRepository.ts
export function makePlayRepository(prisma: PrismaClient): PlayRepository {
  return {
    async findAssignmentByToken(shareToken) {
      return prisma.assignment.findFirst({
        where: { shareToken, deletedAt: null },
        include: { questions: true, gradingScale: true },
      });
    },
  };
}
```

### Presentation слой

HTTP маршруты и обработчики Hono:

```typescript
// features/play/presentation/playRoutes.ts
export function makePlayRouter(checkAttempt: CheckAttempt /* ...прочие use-cases */) {
  const router = new Hono();
  router.post("/:shareToken/check", async (c) => {
    const { answers } = CheckAttemptSchema.parse(await c.req.json());
    const result = await checkAttempt(c.req.param("shareToken"), answers);
    return c.json(result);
  });
  return router;
}
```

### Инжекция зависимостей (composition root)

`app.ts` — единственный файл, который импортирует и application, и infrastructure:

```typescript
// apps/api/src/app.ts
import { makePlayRepository, makeCheckAttempt, makePlayRouter } from "./features/play";

export function createApp() {
  const app = new Hono();
  // ...глобальные middleware и onError...

  const playRepo = makePlayRepository(prisma);
  const checkAttempt = makeCheckAttempt(playRepo);
  app.route("/play", makePlayRouter(checkAttempt /* ...прочие use-cases */));

  return app;
}
```

### Структура shared (бэкенд)

```
shared/
├── errors/                кастомные ошибки
├── infrastructure/        конфиг БД (Prisma client)
├── middleware/            Hono middleware
└── utils/                 помощники
```

---

## npm Workspaces и Shared пакет

```
packages/shared/
├── schemas/               Zod-схемы валидации
├── types/                 TypeScript типы
├── enums/                 String enums (GradingScaleType)
└── grading/               чистые функции расчёта процента и оценки
```

Расчёт оценки живёт в `packages/shared/grading`, чтобы бэкенд и фронтенд (превью шкалы в редакторе) считали одинаково.

---

## Ключевые решения

### Пользователи и доступ

- **Учитель** — единственный пользователь с аккаунтом (email + пароль или Google OAuth)
- **Ученик** — без аккаунта и без регистрации: открывает задание по ссылке
- **Ссылка** содержит случайный `shareToken` задания (не последовательный id), чтобы ссылки нельзя было подобрать

### Аутентификация

- **Access token:** JWT, хранится в памяти браузера
- **Refresh token:** JWT, хранится в httpOnly cookie, хэшируется HMAC-SHA256
- **Google OAuth:** для быстрой регистрации учителя

### Оценивание

- Оценка считается **только по проценту правильных ответов** — скорость и очки на неё не влияют
- Учитель решает для каждого задания, **ставить ли оценку**; без оценки ученик видит только процент
- **Шкала** — упорядоченный список порогов «минимальный процент → оценка» (`[{ minPercent: 95, label: "10" }, …]`)
- **Встроенные шкалы:** 10-балльная, 5-балльная (русская), американская (A–F). Хранятся как пресеты в коде (`GradingScaleType`)
- **Своя шкала:** учитель создаёт собственную (те же пороги), хранится в БД и принадлежит учителю
- Новая встроенная шкала добавляется одним пресетом — без изменений в остальном коде

### Результаты учеников (первая версия)

- Ответы проверяет **сервер**: правильные ответы не отправляются в браузер ученика заранее, чтобы их нельзя было подсмотреть
- Сервер возвращает процент и оценку и **ничего не сохраняет** — в БД нет таблицы попыток и результатов
- Ученик видит оценку на своём экране в конце игры; учитель в кабинете результатов не видит
- Повторно пройти задание можно сколько угодно, ограничений нет
- Имя ученика не спрашивается

### Сценарий игры

Один сценарий: учитель создаёт задание и делится ссылкой → ученик открывает ссылку и проходит игру в своём темпе → видит процент и оценку. Только обычные HTTP-запросы.

### База данных

- **Soft delete:** `deletedAt` поле вместо физического DELETE
- **Явные @@index** на всех FK полях для производительности
- Персональных данных учеников в БД нет

### Изображения (Яндекс Object Storage)

- **Загрузка:** бэкенд загружает файл через S3-совместимый API (`@aws-sdk/client-s3`) на эндпоинт `https://storage.yandexcloud.net`
- **Хранение:** в БД сохраняется полный публичный URL изображения (`https://{bucket}.storage.yandexcloud.net/{key}`)
- **Отдача:** фронтенд использует URL напрямую из БД
- **Переменные окружения:**
  - `YANDEX_S3_ACCESS_KEY` — бэкенд (ID ключа доступа)
  - `YANDEX_S3_SECRET_KEY` — бэкенд (секретный ключ)
  - `YANDEX_S3_BUCKET` — бэкенд (имя бакета)
  - `YANDEX_S3_ENDPOINT` — бэкенд (`https://storage.yandexcloud.net`)

### Платежи

- Учитель платит за подписку через PayPal, в том числе картой без аккаунта PayPal. Детали тарифов — не решены

### CORS

Настраивается **первым middleware** в `app.ts`, до любых маршрутов.

### Rate limiting

Реализовано in-memory. **Требует одной реплики** `api` в docker-compose.

### Деплой: Caddy, заголовки и CSP

**Задача на деплой, обязательна до публикации.** Схема как в NatsDoll: Caddy стоит спереди, Hono и Nuxt за ним, страницы отдаёт только Nuxt.

```
браузер → Caddy ─┬─ /api/*     → Hono (api:3000)
                 └─ остальное  → Nuxt (web:3000)
```

- Все заголовки страниц и CSP живут в `Caddyfile`, а не в коде приложения. Сейчас их нет: в приложении не настроено ни заголовков, ни CSP
- Нужны: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`; убрать `X-Powered-By`
- `Cross-Origin-Opener-Policy`: `same-origin-allow-popups`, иначе вход через Google во всплывающем окне может не работать
- Caddy перезаписывает `X-Real-IP` адресом TCP-пира, иначе клиент подделает заголовок и обойдёт rate limiting
- Hono ставит `secureHeaders` только на ответы API

**CSP через hash, не nonce:** nonce несовместим с кешем HTML (`swr`). В `script-src` нет `'unsafe-inline'`; в `style-src` он нужен из-за атрибутов `style` и inline-тегов `<style>`. В `img-src` нужен `data:`, иначе пропадут CSS-маски в `WhyUs` и `HowToStart`.

Hash не пишется вручную, в отличие от NatsDoll:

1. После сборки скрипт считает hash inline-скриптов Nuxt (`importmap`, `__NUXT__`) и передаёт в Caddy через переменную окружения: `script-src 'self' {$CSP_SCRIPT_HASHES}`
2. Playwright открывает за Caddy `/` и страницу с `ssr: false`; нарушения CSP останавливают деплой. Устаревший hash не ломает сборку, но блокирует скрипты, и сайт перестаёт быть интерактивным

**Проверено на `/` и 404:** выполняются два одинаковых inline-скрипта, `importmap` и `__NUXT__`, стабильные между запросами. В `__NUXT__` есть `buildId`, поэтому hash меняется при каждой сборке.

**Не проверено:** совпадают ли они на страницах с `ssr: false`, таких страниц пока нет. Если нет, для этих страниц придётся использовать отдельный hash или nonce на каждый запрос.

Если `apps/api` окажется на другом домене, его нужно добавить в `connect-src`.

---

## Позже (не в первой версии)

### Режимы игры (возможно, не будут никогда)

- **Живая игра в классе** — экран проектора + телефоны учеников, все отвечают одновременно. Потребует WebSocket (`@hono/node-ws`) на Hono-сервере; комнаты in-memory → одна реплика `api`. Ученик вводит имя или ник, оно живёт только в памяти комнаты
- **Домашнее задание** — срок сдачи, после которого ссылка закрывается

### Сохранение результатов

Если появится сохранение результатов у учителя, вместе с ним решаются:

- Таблица результатов в кабинете учителя
- Какая попытка засчитывается: первая / лучшая / последняя — выбор учителя для каждого задания
- Оценка «замораживается» в момент завершения попытки — изменение шкалы не пересчитывает её
- «Тот же ученик» без аккаунта = то же имя в рамках задания (без учёта регистра и пробелов)
- Срок хранения и удаление данных учеников (GDPR, COPPA), «корзина» перед окончательным удалением

---

## Открытые вопросы

- Типы игр и шаблоны заданий для первой версии
- Языки интерфейса и мультиязычность (i18n)
- Тарифы и что входит в бесплатный план

---

## Правила разработки

### Что обязательно делать

- ✓ Экспортировать публичный API через `index.ts`
- ✓ Импортировать строго сверху вниз по слоям ФСД
- ✓ Писать unit-тесты рядом с компонентом
- ✓ Использовать composables для логики
- ✓ Использовать Zod-схемы из shared для валидации
- ✓ Инжектировать зависимости через параметры

### Что нельзя делать

- ✗ Deep imports (импортировать из подпапок минуя `index.ts`)
- ✗ Импортировать снизу вверх по слоям ФСД
- ✗ Писать логику в компонентах (переносить в composables)
- ✗ Использовать Prisma в presentation слое
- ✗ `rgba()` — использовать `rgb(r g b / alpha)`
- ✗ Менять готовые анимации Ната без запроса
- ✗ Коммитить без явного запроса пользователя
