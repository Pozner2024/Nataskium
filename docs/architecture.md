# Nataskium — Архитектура проекта

**Версия:** 0.1
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
│       ├── grading/      ← расчёт оценки по шкале (общий для api и web)
│       ├── library/      ← slug библиотечных викторин
│       ├── locales/      ← языки интерфейса (SUPPORTED_LOCALES)
│       └── routes/       ← пути страниц (auth, teacher, library)
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
- **CSR (`ssr: false`)** — приватные и интерактивные: `/auth/**` (вход, регистрация, ссылки из писем), `/teacher` и `/teacher/**` (кабинет учителя). Игра ученика `/play/**` — тоже CSR: при открытии по ссылке язык выбирается по `navigator.languages`, выбор переключателем языка не перебивается

Пути перечислены в `CLIENT_ONLY_PATHS` в `nuxt.config.ts`; правило ставится для каждого языкового префикса (`/auth/**`, `/en/auth/**`, `/de/auth/**`, …):

```ts
const CLIENT_ONLY_PATHS = ['/auth/**', '/teacher', '/teacher/**', '/play/**']
```

`**` — всё, что после адреса (`/teacher/create`, `/teacher/library`, `/teacher/settings`). Сам `/teacher` указан отдельно. Доступ к кабинету — middleware `teacher-auth` (без сессии — на вход с `?next=`), со страниц входа и регистрации вошедшего уводит `guest-only`. Это только навигация: данные защищает API.

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
- `quiz-editor/` — состояние редактора викторины (вопросы, настройки, шкала)
- `play/` — прогресс ученика в игре (текущий вопрос, ответы)
- `matching-editor/` — состояние редактора сопоставления (пары, настройки)
- `matching-play/` — прогресс ученика в сопоставлении (какое слово поставлено на какое определение)
- `true-false-editor/` — состояние редактора «да/нет» (утверждения, настройки)

**Store опционален в:**

- `assignments/` — список заданий учителя
- `grading-scales/` — шкалы учителя

### Слайсы заданий (викторина, сопоставление и «да/нет»)

- `pages/PlayPage` — диспетчер игры: выбирает язык по браузеру (`usePlayLocaleRedirect`), затем делает **один** `playApi.get(token)` и по `type` показывает `QuizPlay` (данные передаются в `store.start(…, initial)`, второго запроса нет) или игру сопоставления (игра «да/нет» запланирована, ждёт `player-embed`, ADR 0014). При ошибке загрузки `QuizPlay` получает токен без данных и сам показывает «не найдено» или «повторить»
- `widgets/quiz-editor`, `widgets/quiz-play` — редактор и игра викторины
- `widgets/matching-editor`, `widgets/matching-play` — редактор и игра сопоставления
- `widgets/true-false-editor` — редактор «да/нет» (ADR 0016); `widgets/true-false-play` — игра, запланирована (ждёт `player-embed`), в коде её ещё нет
- `features/play-session` — общий таймер игры (`PlayTimer`, `usePlayTimer`, `formatClock`)
- `features/activity-settings` — общая форма настроек задания (раздел, «показывать ответы», шкала, таймер; `GroupSelect`)
- `features/take-library-quiz` — «Взять себе» из библиотеки; `takenEditPath` выбирает редактор копии по `type` из ответа: `matching` → `/teacher/matching/<id>`, `truefalse` → `/teacher/true-false/<id>`, `quiz` → `/teacher/quiz/<id>`
- `entities/quiz` — API викторины и игры (`playApi` общий для викторины и сопоставления; методы «да/нет» появятся вместе с игрой), `PREVIEW_QUERY`, `usePlayLocaleRedirect` и `pickPlayLocale` (редирект на язык браузера ученика)
- `entities/matching` — API сопоставления в кабинете и в игре
- `entities/true-false` — API «да/нет» в кабинете (`trueFalseApi`)

### CSS и стили

Стили пишутся в `<style scoped lang="scss">` компонента, используется **BEM нотация**.
Глобальные стили — в `src/assets/styles/`:

```
assets/styles/
├── breakpoints.module.scss ← миксины tablet / desktop
├── mixins.scss             ← текст, заголовок секции, поверхность карточки (card-surface), секция, пункт списка, зоны платы (board-zones)
└── global.scss             ← CSS-переменные в :root (цвета бренда, шрифты, z-index, layout), сброс и базовые стили
```

Эффект платы за курсором рисует `shared/ui/PcbGlow.vue`; миксин `board-zones` отдаёт ему зоны через CSS-переменную `--pcb-zones`.

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
│   ├── createQuiz.ts
│   ├── checkAnswer.ts
│   └── getPlayQuiz.ts
├── infrastructure/                 работа с БД (репозитории)
│   └── {featureName}Repository.ts
├── presentation/                   HTTP маршруты (Hono)
│   └── {featureName}Routes.ts
└── index.ts                        публичный API
```

### Application слой

Содержит бизнес-логику в виде use-cases. Один файл = одна операция. Use-case — **фабрика** `make…`, которая принимает зависимости и возвращает функцию операции:

```typescript
// features/play/application/checkAnswer.ts
export function makeCheckAnswer(deps: { quizzes: PlayQuizSource }) {
  return async function checkAnswer(shareToken: string, input: PlayCheckInput): Promise<PlayCheckResponse> {
    const quiz = await loadPlayableQuiz(deps.quizzes, shareToken);
    // Ответы скрыты учителем: маршрут для ученика не существует
    if (!quiz.showAnswers) throw playQuizNotFound();
    if (input.version !== quizVersion(quiz)) throw playVersionConflict();

    const question = quiz.questions[input.questionIndex];
    if (question === undefined) throw playInvalid("Question index out of range");
    assertSelectionFits(question, input.selected);
    return { correct: correctIndexes(question) };
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
// features/quizzes/infrastructure/quizRepository.ts
export function makeQuizRepository(prisma: PrismaClient): QuizRepository {
  return {
    async findByShareToken(token) {
      const row = await prisma.quiz.findFirst({ where: { shareToken: token, deletedAt: null }, select: QUIZ_SELECT });
      return row === null ? null : toStoredQuiz(row);
    },
  };
}
```

### Presentation слой

HTTP маршруты и обработчики Hono:

```typescript
// features/play/presentation/playRoutes.ts
export function makePlayRouter(deps: PlayRouterDeps) {
  const router = new Hono();
  router.post("/:shareToken/check", deps.limiters.check.middleware(deps.clientIp), async (c) => {
    const input = await readJsonBody(c, playCheckInputSchema);
    return c.json(await deps.checkAnswer(c.req.param("shareToken"), input));
  });
  return router;
}
```

### Инжекция зависимостей (composition root)

`app.ts` — единственный файл, который импортирует и application, и infrastructure:

```typescript
// apps/api/src/app.ts
import { makeQuizRepository } from "./features/quizzes";
import { makeCheckAnswer, makePlayRouter, PLAY_ROUTES_BASE_PATH } from "./features/play";

export function createApp() {
  const app = new Hono();
  // ...глобальные middleware и onError...

  const quizzes = makeQuizRepository(prisma);
  app.route(PLAY_ROUTES_BASE_PATH, makePlayRouter({ checkAnswer: makeCheckAnswer({ quizzes }) /* ...прочие зависимости */ }));

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

### Тесты (бэкенд)

- **Unit** — `npm run test` в `apps/api`, без Docker: интеграционные тесты исключены в `vitest.config.ts`
- **Интеграционные** (`tests/integration/*.int.test.ts`) — на настоящем PostgreSQL в отдельном контейнере, dev-БД они не трогают:

```bash
cp .env.test.example .env.test                    # один раз; креды не секретные
docker compose -f docker-compose.test.yml up -d   # db-test: 127.0.0.1:5433, данные в tmpfs
npm run test:integration -w @nataskium/api        # migrate deploy, затем тесты
```

Раннер отказывается работать, если адрес не указывает на локальную базу с суффиксом `_test` на порту 5433; очистка таблиц (`TRUNCATE`) сама проверяет имя базы.

### Локальный запуск (Docker)

- После смены зависимостей (`package-lock.json`) — `docker compose up -d --build -V`: `-V` пересоздаёт анонимный том `/app/node_modules`, иначе контейнер останется со старыми пакетами
- Контейнер `api` при старте только генерирует Prisma Client; миграции применяются отдельно командой Prisma (`prisma migrate`)
- Миграции: разработка — `npm run db:migrate -w apps/api` (`prisma migrate dev`), сервер — `npm run db:deploy -w apps/api` (`prisma migrate deploy`)
- Конфиг Prisma — `apps/api/prisma7.config.ts` (нестандартное имя, поэтому команды передают `--config`)

---

## npm Workspaces и Shared пакет

```
packages/shared/
├── schemas/               Zod-схемы валидации
├── grading/               чистые функции расчёта процента и оценки
├── library/               slug библиотечных викторин
├── locales/               языки интерфейса (SUPPORTED_LOCALES)
└── routes/                пути страниц (auth, teacher, library)
```

Расчёт оценки живёт в `packages/shared/grading`, чтобы бэкенд и фронтенд (превью шкалы в редакторе) считали одинаково.

---

## Ключевые решения

Новые решения записываются ADR в `docs/adr/`; этот раздел постепенно переносится туда.

### Пользователи и доступ

- **Учитель** — единственный пользователь с аккаунтом (email + пароль или Google OAuth)
- **Ученик** — без аккаунта и без регистрации: открывает задание по ссылке
- **Ссылка** содержит случайный `shareToken` задания (не последовательный id), чтобы ссылки нельзя было подобрать

### Аутентификация

- **Маршруты:** `/api/auth/*` (`register`, `verify-email`, `login`, `refresh`, `logout`, `logout-all`, `me`, `forgot-password`, `reset-password`, `change-password`, `delete-account`, `google/*`). Hono монтирует их под `/api`, Caddy префикс не срезает, в dev Nuxt проксирует `/api` на API (`nitro.devProxy`) — пути одинаковы везде
- **Регистрация:** учитель создаётся **только при подтверждении email**. До этого пароль (argon2id) хранится в записи `pending_registrations`; ссылка из письма активирует её только вместе с паролем этой регистрации, поэтому чужая регистрация на твой email не даёт войти в аккаунт
- **Access token:** JWT (HS256, `typ: at+jwt`, `iss`, `aud`) на 15 минут, хранится только в памяти браузера
- **Refresh token:** непрозрачная случайная строка (32 байта, base64url), в БД — только HMAC-SHA256. Хранится в cookie `__Secure-refresh_token`: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`. Скользящий срок 14 дней, сессия — не дольше 30 дней с входа, до 5 сессий на учителя
- **Ротация семьями:** каждый refresh выдаёт новый токен в той же семье (семья = один вход). Повторное предъявление уже ротированного токена считается кражей: удаляется вся семья, другие устройства учителя не затрагиваются. «Выйти везде» удаляет все семьи
- **Google OAuth:** для быстрой регистрации учителя

### Оценивание

- Оценка считается **только по проценту правильных ответов** — скорость и очки на неё не влияют
- Учитель решает для каждого задания, **ставить ли оценку**; без оценки ученик видит только процент
- **Шкала** — упорядоченный список порогов «минимальный процент → оценка» (`[{ minPercent: 95, label: "10" }, …]`)
- **Встроенные шкалы:** 10-балльная, 5-балльная (русская), американская (A–F). Хранятся как пресеты в коде (`GradingScaleType`)
- **Своя шкала:** учитель создаёт собственную (те же пороги), хранится в БД и принадлежит учителю
- Новая встроенная шкала добавляется одним пресетом — без изменений в остальном коде
- **Сопоставление** считается так же: процент верных пар через `summarizeQuiz` (верная пара — 60 баллов, неверная или пустая — 0, частично верных нет). **«Да/нет»** — так же: верный ответ — 60 баллов, неверный или `null` — 0

### Результаты учеников (первая версия)

- Ответы проверяет **сервер**: правильные ответы не отправляются в браузер ученика заранее, чтобы их нельзя было подсмотреть
- Сервер возвращает процент и оценку и **ничего не сохраняет** — в БД нет таблицы попыток и результатов
- Ученик видит оценку на своём экране в конце игры; учитель в кабинете результатов не видит
- Повторно пройти задание можно сколько угодно, ограничений нет
- **Принятый риск (решение пользователя, 2026-11-13).** В режиме «скрывать ответы» правильные ответы можно подобрать многократными прохождениями, сравнивая процент: сервер без состояния, перепрохождения не ограничены. Режим защищает от подсматривания, не от целенаправленного подбора. В режиме «показывать» `check` можно вызвать до ответа — это допустимо, ответы и так показываются
- **Расширение принятого риска для сопоставления (ADR 0013).** При `showAnswers: false` можно отправлять частичные ответы (`null` у остальных пар) и по проценту проверять одну пару за запрос: до ~n² запросов `finish`, то есть до 100 при 10 парах — укладывается в лимит `finish` 120/мин с одного IP. Защиту не добавляем
- **Расширение принятого риска для «да/нет» (ADR 0016).** Ответа всего два, поэтому при `showAnswers: false` частичными ответами (`null` у остальных утверждений) каждое утверждение выясняется за один запрос `finish`: N+1 ≤ 31 вызов при 30 утверждениях, меньше лимита `finish` 120/мин с одного IP. Защиту не добавляем (решение пользователя). `check` у «да/нет» доступен только при `showAnswers: true`, когда ответы и так показываются
- Имя ученика не спрашивается

### Викторины и игра

- **Модель `quizzes`:** одна таблица для заданий всех типов (ADR 0013): колонка `type` (`quiz` / `matching` / `truefalse`, по умолчанию `quiz`), `title`, `shareToken` (уникальный), `showAnswers`, `gradingScale` (`ten` / `five` / `letter` / `null`), `timerMode` (`none` / `stopwatch` / `limit`, по умолчанию `none`), `timeLimitSeconds` (секунды, только при `limit`), `questions` (jsonb: форму и длины проверяет Zod из `packages/shared/schemas/quiz.ts`), `deletedAt`. CHECK в миграциях: `grading_scale` только из трёх значений, `title` и `share_token` не пустые, `timer_mode` из трёх значений, `time_limit_seconds` задан только при `limit` и в пределах 60…10800 (`quizzes_time_limit_check`, `IS NOT NULL` в ветке `limit` обязателен). В Zod таймер — одно поле `timer`: `{ mode: 'none' } | { mode: 'stopwatch' } | { mode: 'limit', seconds }`; колонки ↔ объект — `timerFromColumns` / `timerToColumns` в `packages/shared`. Решение — ADR 0012. Индекс `(teacher_id, deleted_at)`. У `type = 'matching'` в `questions` лежат пары `{ term, definition }` (имя колонки историческое, переименование отложено). У `type = 'truefalse'` лежат утверждения `{ statement, answer }` (`answer` — boolean; ADR 0016). CHECK `quizzes_type_check` (`type IN ('quiz', 'matching', 'truefalse')`), `quizzes_matching_pairs_check` (у `matching` — массив из 2–10 элементов, границы дублируют `MIN/MAX_MATCHING_PAIRS`) и `quizzes_truefalse_items_check` (у `truefalse` — массив из 2–30 элементов, границы дублируют `MIN/MAX_TRUE_FALSE_ITEMS`). Запросы, которые разбирают строку схемой одного типа, фильтруют по `type` (константы `QUIZ_ACTIVITY` / `MATCHING_ACTIVITY` / `TRUE_FALSE_ACTIVITY` из `packages/shared/schemas/activity.ts`); список кабинета, подсчёт лимита и purge — по всем типам. FK на учителя с `ON DELETE CASCADE` — при удалении аккаунта викторины удаляются физически, включая помеченные `deletedAt`. Удаление викторины учителем — soft delete
- **Лимит:** не больше `MAX_ACTIVITIES_PER_TEACHER = 100` неудалённых заданий **всех типов** на учителя (`packages/shared/schemas/quiz.ts`; `MAX_QUIZZES_PER_TEACHER` — псевдоним). Сверх лимита `POST /api/quizzes`, `POST /api/matchings`, `POST /api/true-false` и «Взять себе» отвечают 409. Проверка не атомарна: две параллельные попытки на последней викторине могут обе пройти
- **`/api/quizzes`** (кабинет, Bearer на всех маршрутах): `GET /` список, `POST /` создать, `GET|PATCH|DELETE /:id`. Владелец проверяется в каждом запросе; чужая, удалённая и несуществующая викторина (в том числе невалидный `:id`) дают одинаковый 404, не 403. Список `GET /` общий для всех типов: у элемента есть `type`, у сопоставления `questionCount` — число пар, у «да/нет» — число утверждений
- **`/api/matchings`** (кабинет, Bearer): `POST /` создать, `GET|PATCH|DELETE /:id`. Те же правила владельца и 404, что у `/api/quizzes` (id задания другого типа — тоже 404). Пары — 2–10, слово до 60 символов, определение до 200; слова уникальны внутри задания, определения тоже, без учёта регистра, лишних пробелов и формы Unicode (`matchingKey`). `PATCH` без проверки версии, как у викторины
- **`/api/true-false`** (кабинет, Bearer; ADR 0016): `POST /` создать, `GET|PATCH|DELETE /:id`. Те же правила владельца и 404, что у `/api/quizzes` (id задания другого типа — тоже 404). Утверждения — 2–30, текст до 200 символов; повторы запрещены без учёта регистра, лишних пробелов и формы Unicode (`matchingKey`, сообщение `Duplicate text`). Содержимое — `{ statement, answer }[]`. `PATCH` без проверки версии
- **Публикация в библиотеку** автоматическая при создании (ADR 0002): отдельного переключателя `isPublic` в API нет. Копия «Взять себе» создаётся с `isPublic: false` (ADR 0005)
- **`/api/play/:shareToken`** (публично, лимит по IP):
  - `GET /` — задание любого типа, ответ — union по `type`. Викторина (`type: 'quiz'`) — без правильных ответов: тексты вариантов, `selectCount`, `version`, `timer` (режим и лимит публичны, не секретны). Сопоставление (`type: 'matching'`) — `definitions` в порядке учителя и `terms`, которые сервер перемешивает заново при каждом запросе (Fisher–Yates на CSPRNG, `secureShuffle`), без пар и без id: связи слова с определением в ответе нет
  - `POST /check` — правильные индексы вопроса; при `showAnswers: false` отвечает 404, как будто маршрута нет
  - `POST /finish` — `{ percent, grade }`, ничего не сохраняется. Пустой массив в `answers[i]` означает «не отвечено» (например, вышло время) и даёт 0 баллов за вопрос; непустой проверяется строго. Сервер про время не знает
  - 409 — `version` не совпала с текущей (учитель изменил викторину); 400 — индексы выбранных вариантов вне диапазона или неверное число отмеченных у непустого ответа (`check` пустой выбор тоже отклоняет)
  - `version` — `updatedAt` викторины в ISO
  - `POST /matching/finish` — только для сопоставления, под тем же лимитером `finish`. Тело `{ version, answers: (string | null)[] }`: `answers[i]` — текст слова для определения `i`, `null` — «не отвечено» (0 за пару). Длина строго равна числу пар; слово не из задания (сравнение по точному тексту) и повтор слова — 400; устаревшая `version` — 409. Ответ — `{ result }` и `review` (`{ correct, term }[]`) только при `showAnswers`, иначе поля нет. `/check` у сопоставления нет. Токен задания другого типа на чужом маршруте — 404
  - «Да/нет» (`type: 'truefalse'`, ADR 0016): `GET /` — `statements` в порядке учителя, `showAnswers`, `timer`, `version`, правильных ответов нет нигде
  - `POST /true-false/check` — тело `{ version, index, answer }`, ответ `{ correct }`; только при `showAnswers`, иначе 404; индекс вне диапазона — 400; лимитер `check`
  - `POST /true-false/finish` — тело `{ version, answers: (boolean | null)[] }`, `null` — «не отвечено» (0 баллов); длина строго равна числу утверждений, устаревшая `version` — 409; лимитер `finish`. Ответ — `{ result }` и `review` (`{ correct, answer }[]`) только при `showAnswers`, иначе поля нет
- **Библиотека:** список и карточка показывают задания всех типов с `type`. Карточка викторины — первые `LIBRARY_PREVIEW_QUESTIONS` (5) вопросов; карточка сопоставления — все определения по порядку и все слова, перемешанные сервером (то же, что отдаёт игра); карточка «да/нет» — только тексты утверждений, без ответов. «Взять себе» ветвится по типу и отвечает `{ quizId, type }`; у сопоставления и «да/нет» картинок нет, копируется только содержимое (у «да/нет» — вместе с ответами, в непубличную копию)

### Сценарий игры

Один сценарий: учитель создаёт задание и делится ссылкой → ученик открывает ссылку и проходит игру в своём темпе → видит процент и оценку. Только обычные HTTP-запросы. Таймер (без таймера / секундомер / лимит на всё задание) отсчитывается на клиенте от показа первого вопроса; по истечении лимита игра завершается сама, неотвеченные вопросы дают 0 (ADR 0012).

Типов задания три: викторина, сопоставление (ADR 0013) и «да/нет» (ADR 0016). Ссылка `/play/<shareToken>` одна для всех: страница `PlayPage` выбирает язык по браузеру, затем делает один `GET /api/play/:token` и по `type` показывает игру нужного типа. В сопоставлении слово перетаскивают из лотка, прилипающего к верху экрана, на определение; тап (слово, затем определение) — запасной путь и путь клавиатуры и скринридера. Определения на клиенте не перемешиваются: номер определения — порядок учителя. В «да/нет» ученик отвечает «Да» или «Нет» на утверждения в порядке учителя; экран игры ещё не реализован, ждёт `player-embed` (ADR 0014).

### База данных

- **Soft delete:** `deletedAt` поле вместо физического DELETE — для отдельных сущностей вроде заданий. Задания, удалённые больше 30 дней назад (`DELETED_QUIZ_RETENTION_MS`), раз в сутки удаляются физически (`purgeDeletedQuizzes`)
- **Списки заданий** (кабинет и библиотека) не загружают `questions`: число вопросов считает база (`jsonb_array_length`)
- **Учитель удалён, а access-токен ещё жив** (до 15 минут): создание задания, загрузка картинки и «Взять себе» отвечают 401, а не 500
- **Удаление аккаунта учителя — полное (GDPR):** запись учителя удаляется физически вместе с его данными, без `deletedAt`. Вместе с учителем удаляются и его задания и шкалы, включая помеченные `deletedAt`. Файлы его картинок удаляются из хранилища сразу после удаления аккаунта (id собираются до удаления строк); сбой хранилища удаление не откатывает — такие файлы подчищает сверка
- **Подтверждение удаления аккаунта.** Учитель с паролем подтверждает удаление паролем (`POST /api/auth/delete-account`). Учитель, у которого вход только через Google, — повторным входом в тот же Google-аккаунт:
  - `POST /api/auth/google/reauth/start` под Bearer создаёт одноразовую запись `pending_google_reauths` (HMAC от state, 5 минут) и cookie `oauth` с `purpose: reauth`; ответ — адрес Google, переход делает страница.
  - `/api/auth/google/callback` проверяет state, PKCE и nonce и совпадение `sub` с привязанным `googleId`. Затем в одной транзакции снимает запись, проверяет, что у учителя по-прежнему нет пароля, и удаляет его. Сброс и смена пароля гасят незавершённые подтверждения учителя: аккаунт с паролем удаляется только по паролю. Итог — на `/auth/account-deleted` (`?status=deleted` или `?error=<код>`), после удаления уходит письмо «Аккаунт удалён».
  - **Принятый риск (решение пользователя, 2026-11-12).** Google не подтверждает, что вход был повторным: при `max_age=0` `auth_time` в id_token не приходит, пароль Google не запрашивает (проверено на живом Google). Поэтому сервер проверяет, что в браузере вошли именно в Google-аккаунт учителя, но не то, что вход был только что. Человек за незаблокированным компьютером учителя, где открыты и кабинет, и Google, может удалить аккаунт без пароля. Смягчение: явное «Вы уверены?» до перехода в Google, письмо об удалении на адрес аккаунта. Чужой человек на своём устройстве аккаунт не удалит: ему нужен вход в Google-аккаунт учителя
- **Откат кода после появления строк `matching` (ADR 0013).** Старый код разбирает любую строку схемой викторины и отвечает 500 в кабинете, библиотеке и игре. Перед откатом кода: сохранить id строк (`SELECT "id" FROM "quizzes" WHERE "type" = 'matching' AND "deleted_at" IS NULL`), затем `UPDATE "quizzes" SET "deleted_at" = now(), "is_public" = false WHERE "type" = 'matching' AND "deleted_at" IS NULL`. После повторного выката строки из списка можно вернуть (`deleted_at = NULL`) в течение 30 дней, до purge. Порядок выката: миграция `add_quiz_type`, затем API и web вместе. Ручной откат миграции — в её заголовке
- **Откат кода после появления строк `truefalse` (ADR 0016).** Старый код разбирает любую строку схемой викторины и падает на строках `truefalse` так же, как на `matching`. Перед откатом кода: сохранить id строк (`SELECT "id" FROM "quizzes" WHERE "type" = 'truefalse' AND "deleted_at" IS NULL`), затем `UPDATE "quizzes" SET "deleted_at" = now(), "is_public" = false WHERE "type" = 'truefalse' AND "deleted_at" IS NULL`. После повторного выката строки из списка можно вернуть (`deleted_at = NULL`) в течение 30 дней, до purge. Порядок выката: миграция `add_truefalse_type`, затем API и web вместе. Ручной откат миграции — в её заголовке
- **Явные @@index** на всех FK полях для производительности
- Персональных данных учеников в БД нет

### Изображения (Яндекс Object Storage)

- **Таблица `quiz_images`:** `id` (UUID задаёт сервер), `teacherId`, `quizId` (null — картинка ещё не сохранена в викторине или отвязана), `createdAt`. Файл — `quiz-images/<id>.webp` в бакете; URL в БД не хранится, его строит `publicUrl`. FK на учителя — `ON DELETE CASCADE`, на викторину — `SET NULL`. Индексы `teacher_id`, `quiz_id`, `(quiz_id, created_at)`
- **Привязка:** в вопросах и вариантах викторины — `imageId`. Сохранение викторины в одной транзакции привязывает картинки (только свои и существующие, одна картинка — в одном месте) и отвязывает убранные; файлы отвязанных удаляются после коммита
- **`POST /api/quiz-images`** (Bearer): multipart, ровно один файл в поле `file`, до 15 МБ (`MAX_IMAGE_UPLOAD_BYTES`). Формат — по сигнатуре и `sharp`, не по имени и Content-Type: только JPEG, PNG, WebP. Результат всегда перекодируется в WebP (до 1200 px по большей стороне, без EXIF/GPS). Ответ 201 `{ image: { id, url } }`; 400 — нет файла, слишком большой, не картинка; 408 — тело не пришло за 120 с (`UPLOAD_BODY_READ_TIMEOUT_MS`, слот освобождается); 503 — хранилище недоступно или не настроено, а также все слоты обработки заняты (`Retry-After`)
- **Лимиты загрузки** (`features/quiz-images/limits.ts`): в час — 120 на учителя, 300 на IP; одновременно — 4 всего и 2 на учителя (слот занимается до чтения тела); `sharp` обрабатывает одну картинку за раз, очередь — до 8
- **Порт `ImageStorage`** (`shared/infrastructure/imageStorage.ts`): `put`, `remove`, `listObjects`, `publicUrl`. Реализации: S3 Яндекса (`@aws-sdk/client-s3`, регион `ru-central1`, path-style, таймауты и 3 попытки), в памяти — в тестах (`tests/fakes/memoryImageStorage.ts`). Вне production без переменных хранилища `createImageStorage` возвращает `null` — загрузка отвечает 503, викторины с картинками не сохраняются. Ключ проверяется шаблоном перед каждой операцией; сбой S3 — `ExternalServiceError` только с HTTP-статусом, без ключей и адресов
- **Отдача:** картинки читаются браузером прямо из бакета по `IMAGES_PUBLIC_BASE_URL/<key>`, `Cache-Control: immutable` на год (имя файла не меняется)
- **Очистка раз в сутки** (`makeCleanupImages`, расписание в `src/index.ts`):
  1. Неприкреплённые строки старше суток удаляются вместе с файлами (картинку загрузили, викторину не сохранили)
  2. **Сверка хранилища** (только при `IMAGE_STORAGE_RECONCILE=true`): файлы старше суток без строки в `quiz_images` удаляются — страховка к немедленному удалению файлов аккаунта (GDPR), например если хранилище было недоступно. Объекты не по шаблону ключа и без даты не трогаются; при пустой таблице сверка ничего не удаляет. Включать только там, где бакет принадлежит **только** этой базе: в production — `true`, локально — только с отдельным dev-бакетом
- **Dev-бакет:** отдельный бакет (не прод), публичное чтение объектов, список объектов закрыт; сервисный аккаунт с правами только на этот бакет. Версионирование и логирование бакета **выключены**: в логах доступа были бы IP учеников, в старых версиях — удалённые файлы (GDPR)
- **Переменные окружения** (`shared/config/env.ts`) задаются **все вместе** или ни одной; в production обязательны, адреса — только `https://`:
  - `YANDEX_S3_ENDPOINT` — origin без пути (`https://storage.yandexcloud.net`)
  - `YANDEX_S3_BUCKET` — имя бакета
  - `YANDEX_S3_ACCESS_KEY`, `YANDEX_S3_SECRET_KEY` — ключ сервисного аккаунта
  - `IMAGES_PUBLIC_BASE_URL` — публичный адрес бакета без `/` в конце, query и логина (`https://storage.yandexcloud.net/nataskium-dev`)
  - `IMAGE_STORAGE_RECONCILE` — сверка хранилища: в production задаётся явно (`true` или `false`), иначе API не запустится; вне production по умолчанию `false`

### Лимиты тела запроса

Ставятся глобально в `app.ts` по пути (`bodyLimitFor`), сверх лимита — 413:

- `/api/quizzes` и `/api/quizzes/*` — 160 КБ (50 вопросов с картинками)
- `POST /api/quiz-images` — 16 МБ, но в своём роутере: после проверки токена, лимитов и слота загрузки, иначе тело читалось бы до них
- всё остальное, включая неизвестные адреса, — 100 КБ

### Платежи

- Учитель платит за подписку через PayPal, в том числе картой без аккаунта PayPal. Детали тарифов — не решены

### CORS

Настраивается **первым middleware** в `app.ts`, до любых маршрутов. Разрешён только origin фронтенда из `WEB_ORIGIN`, с `credentials`; `*` не используется. `refresh` и `logout` по cookie дополнительно проверяют заголовок `Origin`.

### Rate limiting

Реализовано in-memory. **Требует одной реплики** `api` в docker-compose.

- Ключ по IP — адрес сокета; для IPv6 — его сеть /64. `X-Real-IP` принимается только от адресов из `TRUSTED_PROXY_IPS` (Caddy), `X-Forwarded-For` не используется
- Лимиты по email считаются по нормализованному адресу: неудачные входы, письма регистрации
- **Лимит неудачных входов (ADR 0018).** Без «знакомого устройства» неудачи входа, подтверждения email и привязки Google считаются по email: 10 за 15 минут (`loginFailuresPerEmail`). После успешного входа по паролю браузер получает cookie `__Secure-device` (`httpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth/login`, 180 дней): `v1.<nonce>.<HMAC-SHA256(HMAC_SECRET, "device:v1:" + email + ":" + passwordHash + ":" + nonce)>`, без персональных данных. Вход с валидной для этого email cookie считает неудачи по nonce устройства (`loginFailuresPerDevice`, 10 за 15 минут), а счётчик email не трогает: чужие неверные пароли такому учителю вход не блокируют. Невалидная, чужая или отозванная cookie — как её отсутствие; смена или сброс пароля отзывают все cookie (в подписи текущий `passwordHash`), поэтому `login` читает учителя до резерва. Cookie переживает выход. Выход cookie не стирает; удаление аккаунта (паролем и через Google) — стирает. Смена пароля и удаление аккаунта вошедшим учителем считают неудачи по его id (`accountFailuresPerTeacher`, 10 за 15 минут). Ограничение: с нового устройства во время атаки на email вход закрыт, остаются сброс пароля и вход через Google
- Числа — в `features/auth/limits.ts` (`PRODUCTION_LIMITS`); `src/index.ts` передаёт их всегда, независимо от `NODE_ENV`
- Маршруты ученика — `features/play/limits.ts` (`PLAY_LIMITS`), на IP, в минуту: `GET` — 120, `check` — 600, `finish` — 120; не больше 100 000 отслеживаемых ключей. Лимиты мягкие: за школьным NAT играет целый класс
- Загрузка картинок — `features/quiz-images/limits.ts` (`IMAGE_UPLOAD_LIMITS`), см. «Изображения»
- Кабинет учителя `/api/quizzes` — `features/quizzes/limits.ts` (`QUIZ_LIMITS`), на учителя (ключ — `teacherId` из токена): чтение — 120 в минуту, запись (`POST`, `PATCH`, `DELETE`) — 60 в минуту, создание — ещё и не больше 200 в сутки. `/api/matchings` и `/api/true-false` используют **те же экземпляры** лимитеров (`teacherActivityLimiters` в `app.ts`): квота учителя общая на все типы заданий
- `GET /api/auth/me` — `mePerIp`, 300 за 15 минут на IP

### Деплой: Caddy, заголовки и CSP

**Задача на деплой, обязательна до публикации.** Схема как в NatsDoll: Caddy стоит спереди, Hono и Nuxt за ним, страницы отдаёт только Nuxt.

```
браузер → Caddy ─┬─ /api/*     → Hono (api:3000)
                 └─ остальное  → Nuxt (web:3000)
```

- Все заголовки страниц и CSP живут в `Caddyfile`, а не в коде приложения. Сейчас их нет: в приложении не настроено ни заголовков, ни CSP
- Нужны: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`; убрать `X-Powered-By`
- `Cross-Origin-Opener-Policy`: `same-origin-allow-popups`, иначе вход через Google во всплывающем окне может не работать
- Caddy перезаписывает `X-Real-IP` адресом TCP-пира, иначе клиент подделает заголовок и обойдёт rate limiting. У Caddy в compose — статический IP, он же в `TRUSTED_PROXY_IPS` (в production переменная обязательна)
- Caddy не срезает префикс `/api`: маршруты API и `Path` refresh-cookie рассчитаны на `/api/*`
- `Referrer-Policy: no-referrer` на страницах `/auth/**`: токены из писем приходят во фрагменте `#token=`, но и сам адрес страницы не должен уходить на сторонние ресурсы
- То же `Referrer-Policy: no-referrer` на `/play/**`: `shareToken` лежит в самом адресе страницы
- Hono ставит `secureHeaders` только на ответы API

**CSP через hash, не nonce:** nonce несовместим с кешем HTML (`swr`). В `script-src` нет `'unsafe-inline'`; в `style-src` он нужен из-за атрибутов `style` и inline-тегов `<style>`. В `img-src` нужен `data:`, иначе пропадут CSS-маски в `WhyUs` и `HowToStart`. **К деплою:** в `img-src` добавить домен хранилища картинок (origin из `IMAGES_PUBLIC_BASE_URL`), иначе картинки викторин в редакторе и на странице задания не покажутся.

Hash не пишется вручную, в отличие от NatsDoll:

1. После сборки скрипт считает hash inline-скриптов Nuxt (`importmap`, `__NUXT__`) и передаёт в Caddy через переменную окружения: `script-src 'self' {$CSP_SCRIPT_HASHES}`
2. Playwright открывает за Caddy `/` и страницу с `ssr: false`; нарушения CSP останавливают деплой. Устаревший hash не ломает сборку, но блокирует скрипты, и сайт перестаёт быть интерактивным

**Проверено на `/` и 404:** выполняются два одинаковых inline-скрипта, `importmap` и `__NUXT__`, стабильные между запросами. В `__NUXT__` есть `buildId`, поэтому hash меняется при каждой сборке.

**Не проверено:** совпадают ли они на страницах с `ssr: false` (`/auth/**`, `/teacher/**`). Если нет, для этих страниц придётся использовать отдельный hash или nonce на каждый запрос.

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

### Суперадмин и админка

Две роли: учитель и суперадмин. Суперадмин видит в админке всех учителей и их задания — для модерации контента, который видят дети, и для поддержки учителей. Делается отдельным шагом вместе с админкой; авторизация учителя строится так, чтобы роль добавлялась одной миграцией.

- Суперадмина нельзя создать через регистрацию или API — только командой на сервере
- Двухфакторный вход обязателен
- Журнал действий: кто, когда и что смотрел или менял
- Правило «учитель видит только своё» остаётся; доступ суперадмина — явное исключение, которое проверяется в каждом use-case

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
