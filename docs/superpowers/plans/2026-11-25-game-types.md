# Типы игр: каталог, превью, страница типа и блок на главной — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** один каталог типов игр, из которого строятся выбор типа у учителя, блок «Познакомьтесь с нашими играми» на главной и публичная страница типа `/games/<slug>` с примерами из библиотеки.

**Architecture:** ключи и порядок типов — `ACTIVITY_KINDS` в `packages/shared`; адреса страниц типа и редакторов — `packages/shared/routes`. Превью и карточка типа — в `entities/activity` (их берут несколько виджетов). Список библиотеки получает фильтр `type`; виджет `LibraryBrowser` умеет показывать список по разделу или по типу.

**Tech Stack:** Nuxt 4 (Vue 3, SSR), @nuxtjs/i18n, Hono, Prisma (raw SQL через `Prisma.sql`), Zod, Vitest (+ @nuxt/test-utils), npm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-25-game-types-design.md`. Макеты: `docs/design/game-types/` (вариант **B «Блоки»**), `docs/design/game-types/REPORT.md`.

## Global Constraints
- Слово в интерфейсе — «тип игры», не «шаблон».
- Типы: только `quiz`, `matching`, `truefalse`, порядок `ACTIVITY_KINDS`. «Пропуски» и «Картинки» убраны отовсюду. Категорий нет.
- Хранимые значения `quizzes.type` не переименовывать.
- Slug: `quiz` → `quiz`, `matching` → `matching`, `truefalse` → `true-false`. Адрес страницы типа `/games/<slug>`.
- Превью типа: стиль B — белые плашки на голубой подложке, акцент `#4573F4`; зелёный и оранжевый — только «верно»/«неверно». Без визуального стиля, без Ната, без текста, `aria-hidden="true"`, холст 4:3 (160×120).
- Переводы во всех 4 локалях (ru/en/de/fr). После правки локалей перезапускать контейнер `web` (иначе сырые ключи).
- Тексты ru — дословно из спеки (раздел «Переводы»).
- ФСД: импорт только сверху вниз, через `index.ts`; сущность не импортирует сущность; виджет не импортирует виджет.
- CSS: `<style scoped lang="scss">`, BEM, цвета с прозрачностью `rgb(r g b / a)`, адаптив только миксинами. Вёрстка только мобильная.
- Никакого `v-html`. Входные данные API — Zod.
- **Коммиты и `git add` делает пользователь.** В ходе плана не коммитить; в конце задачи сообщить, что она готова к добавлению в индекс.
- **Тесты запускаются по сигналу пользователя**; интеграционные (db-test, `docker compose -f docker-compose.test.yml up -d`) — по одному агенту за раз. ESLint и typecheck — можно всегда.
- Шаг «проверить в браузере» — мобильная ширина 390 и 375.

## Review Focus
1. Неизвестный slug (`/games/abc`, `/en/games/gaps`) — настоящий HTTP 404 через `app/error.vue`, а не пустая страница. Тест — в Task 6.
2. Невалидный `type` в `GET /api/library` (`?type=gaps`, `?type=`, `?type=QUIZ`) — 400, не 500 и не «все задания». Тест — в Task 5.
3. «Показать ещё» на странице типа запрашивает страницу 2 **с тем же `type`** и без `group`. Тест — в Task 6.
4. Тип без публичных заданий — текст «пусто», а не ошибка; кнопка «Создать» видна. Тест — в Task 6.
5. Гость жмёт «Создать задание в этой игре» → ссылка ведёт на `/teacher/<type>/new` (с префиксом языка), дальше middleware отправит на вход с `?next=`. Тест — в Task 6 (href).

---

### Task 1: Текст шага «Как начать»

**Files:**
- Modify: `apps/web/src/shared/i18n/locales/{ru,en,de,fr}.ts` — ключ `home.howToStart.stepFormat`

- [ ] **Step 1:** ru: `'Выберите тип игры и визуальный стиль.'`; en: `'Choose a game type and a visual style.'`; de: `'Wählen Sie einen Spieltyp und einen visuellen Stil.'`; fr: `'Choisissez un type de jeu et un style visuel.'`
- [ ] **Step 2:** `npx vitest run src/shared/i18n` (в `apps/web`) — PASS (паритет ключей и плейсхолдеров).
- [ ] **Step 3:** перезапустить `web`, проверить главную в браузере на 390.

### Task 2: Убрать «Пропуски» и «Картинки»

**Files:**
- Modify: `apps/web/src/entities/activity/types.ts` — `export type ActivityType = ActivityKind` (импорт из `@nataskium/shared/schemas`)
- Modify: `apps/web/src/entities/activity/activityTypes.ts` — убрать `gaps`, `pictures`; `ACTIVITY_TYPE_ORDER` = `[...ACTIVITY_KINDS]`
- Modify: `apps/web/src/entities/activity/ActivityCard.vue` (`COUNT_KEYS`), `apps/web/src/widgets/my-activities/useMyActivities.ts` (`REMOVE_APIS` и комментарий), `apps/web/src/widgets/my-activities/ManageActivities.vue` (`EDIT_PATHS` и комментарий), `apps/web/src/pages/TeacherCreatePage.vue` (комментарий «Пропуски и картинки появятся…»; `NEW_ACTIVITY_PATHS` станет полным `Record`)
- Modify: 4 локали — удалить `teacher.activityTypes.gaps|pictures`; `teacher.activities.createHint`: ru `'Викторина, сопоставление или да/нет'`, en `'Quiz, matching or true or false'`, de `'Quiz, Zuordnung oder Richtig oder falsch'`, fr `'Quiz, association ou vrai ou faux'`
- Test: `apps/web/src/widgets/activity-type-picker/activityTypePicker.nuxt.test.ts`

- [ ] **Step 1:** в тесте `'показывает пять плиток по порядку'` → `'показывает три типа по порядку'`, ожидание `['Викторина', 'Сопоставление', 'Да/нет']`.
- [ ] **Step 2:** правки кода; `npm run typecheck -w apps/web` — без ошибок (полные `Record<ActivityType, …>` не должны содержать лишних ключей).
- [ ] **Step 3:** `npx vitest run src/widgets/activity-type-picker src/widgets/my-activities src/entities/activity src/shared/i18n` — PASS.

### Task 3: Каталог — адреса типов и переводы `gameTypes`

**Files:**
- Create: `packages/shared/routes/gamePages.ts`, `packages/shared/routes/gamePages.test.ts`
- Modify: `packages/shared/routes/index.ts`, `packages/shared/routes/teacherPages.ts`
- Modify: `apps/web/src/pages/TeacherCreatePage.vue` — `NEW_ACTIVITY_PATHS` заменить на `newActivityPath`
- Modify: 4 локали — `teacher.activityTypes` → корневой `gameTypes`; `ActivityCard.vue`, `LibraryBrowser.vue`, `ActivityTypePicker.vue`, комментарий в `activityTypes.ts` — на новые ключи

**Interfaces — Produces:**
- `GAME_PAGE_PATHS = { type: '/games' } as const` — к адресу добавляется `/<slug>`
- `GAME_TYPE_SLUGS: Record<ActivityKind, string>` = `{ quiz: 'quiz', matching: 'matching', truefalse: 'true-false' }`
- `gameTypePath(kind: ActivityKind): string` → `'/games/true-false'`
- `parseGameTypeSlug(slug: string): ActivityKind | null`
- `newActivityPath(kind: ActivityKind): string` (в `teacherPages.ts`) → `TEACHER_PAGE_PATHS.quizNew | matchingNew | trueFalseNew`
- Ключи: `gameTypes.<kind>.name`, `.description`, `.about`; `gameTypes.create` (кнопка), `gameTypes.examples` (заголовок примеров), `gameTypes.noExamples` (пусто); `home.gameTypes.title`, `home.gameTypes.subtitle`.

- [ ] **Step 1: тест** `gamePages.test.ts`:
```ts
expect(gameTypePath('truefalse')).toBe('/games/true-false')
expect(ACTIVITY_KINDS.map((kind) => parseGameTypeSlug(GAME_TYPE_SLUGS[kind]))).toEqual([...ACTIVITY_KINDS])
for (const slug of ['truefalse', 'gaps', '', 'Quiz', '__proto__', 'toString']) expect(parseGameTypeSlug(slug)).toBeNull()
expect(ACTIVITY_KINDS.map(newActivityPath)).toEqual(['/teacher/quiz/new', '/teacher/matching/new', '/teacher/true-false/new'])
```
- [ ] **Step 2:** `npx vitest run routes` в `packages/shared` — FAIL (нет модуля).
- [ ] **Step 3:** реализовать; `parseGameTypeSlug` — поиск по значениям `GAME_TYPE_SLUGS` (не по ключам объекта: `__proto__`/`toString`).
- [ ] **Step 4:** PASS. Переводы: ru-тексты `name`/`description`/`about` и блока главной — из спеки дословно; `gameTypes.create` ru `'Создать задание в этой игре'`, `gameTypes.examples` ru `'Примеры заданий'`, `gameTypes.noExamples` ru `'Готовых заданий в этой игре пока нет.'`; en/de/fr — перевод.
- [ ] **Step 5:** `npm run typecheck`, `npx vitest run src/shared/i18n src/entities/activity src/widgets/library-browser src/widgets/activity-type-picker` (в `apps/web`) — PASS. В репозитории не осталось `teacher.activityTypes` (`rg teacher.activityTypes apps/web` — пусто).

### Task 4: Превью и карточка типа; выбор типа у учителя

**Files:**
- Create: `apps/web/src/entities/activity/GameTypePreview.vue`, `apps/web/src/entities/activity/GameTypeCard.vue`, `apps/web/src/entities/activity/gameTypeCard.nuxt.test.ts`
- Modify: `apps/web/src/entities/activity/index.ts`, `apps/web/src/widgets/activity-type-picker/ActivityTypePicker.vue` (+ тест)

**Interfaces — Produces:**
- `GameTypePreview` props `{ type: ActivityType }`; корень `.game-type-preview` с `aria-hidden="true"`, внутри SVG `viewBox="0 0 160 120"`. Рисунки трёх типов и цвета ролей (`--p-*`) — перенести из `docs/design/game-types/` (вариант B). Размер задаёт родитель.
- `GameTypeCard` props `{ type: ActivityType; to?: string }`, emit `select: []`. С `to` — корень карточки с растянутой ссылкой `NuxtLink` на названии (как в `LibraryBrowser`), без `to` — `<button type="button">`, клик → `select`. Содержимое: превью 96px, `.game-type-card__name` (`gameTypes.<type>.name`), `.game-type-card__description`, стрелка в круге 36px. Состояния — из REPORT.md («Карточка типа»).

- [ ] **Step 1: тест** `gameTypeCard.nuxt.test.ts`:
  - с `to: '/games/quiz'`: `a[href="/games/quiz"]` есть, текст ссылки `'Викторина'`, `button` нет;
  - без `to`: клик по `button` → `emitted('select')` длиной 1, ссылки нет;
  - `.game-type-preview` имеет `aria-hidden="true"`, в превью нет текста (`.text() === ''`);
  - для каждого `ACTIVITY_KINDS` в `.game-type-card__description` — непустой перевод (не ключ).
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5:** `ActivityTypePicker` рисует `GameTypeCard` без `to` по `ACTIVITY_TYPE_ORDER`, `select` → `emit('select', type)`. В тесте пикера селекторы `.activity-type-picker__name`/`__tile` → `.game-type-card__name`/`button`, ожидания те же (три имени; третья кнопка → `[['truefalse']]`).
- [ ] **Step 6:** `npx vitest run src/entities/activity src/widgets/activity-type-picker` — PASS; `/teacher/create` в браузере на 390/375 сверить с `screenshots/05-picker-390.png`.

### Task 5: API — фильтр списка библиотеки по типу

**Files:**
- Modify: `packages/shared/schemas/library.ts` (+ `library.test.ts`) — `libraryListQuerySchema.type: activityKindSchema.optional()`
- Modify: `apps/api/src/features/library/types.ts` — `LibraryListFilter.type?: ActivityKind`
- Modify: `apps/api/src/features/library/application/listLibraryQuizzes.ts` — передать `type: query.type`
- Modify: `apps/api/src/features/library/infrastructure/libraryRepository.ts` — `` byType = type === undefined ? Prisma.empty : Prisma.sql`AND type = ${type}` `` в `WHERE` CTE рядом с `byGroup`
- Test: `apps/api/tests/integration/libraryList.int.test.ts`
- Modify: `docs/architecture.md` — параметр `type` у `GET /api/library`

- [ ] **Step 1: тесты.** `library.test.ts`: `libraryListQuerySchema.parse({ type: 'truefalse' }).type === 'truefalse'`; `safeParse` с `type` `'gaps'`, `''`, `'QUIZ'` — `success: false`. `libraryList.int.test.ts` — `it('фильтр по типу: только этот тип из всех разделов')`: публичные quiz в двух разделах, matching, непубличный quiz → `?type=quiz` отдаёт ровно два публичных quiz из обоих разделов; `it('невалидный type — 400')` для `?type=gaps` и `?type=`.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS (интеграцию — по сигналу, одним агентом).

### Task 6: Страница типа `/games/<slug>`

**Files:**
- Modify: `apps/web/src/entities/library/libraryApi.ts` — `LibraryListParams` получает `type?: ActivityKind`; в query только если задан
- Modify: `apps/web/src/widgets/library-browser/useLibraryBrowser.ts`, `LibraryBrowser.vue` (+ тест)
- Create: `apps/web/src/pages/GameTypePage.vue`, `apps/web/src/pages/gameTypePage.nuxt.test.ts`, `apps/web/app/pages/games/[slug].vue`

**Interfaces:**
- Consumes: `parseGameTypeSlug`, `newActivityPath` (Task 3), `GameTypePreview` (Task 4), параметр `type` (Task 5).
- Produces: `LibraryBrowser` props `{ group?: string; type?: ActivityKind }` (ровно один задан). С `group` — как сейчас (поиск, строка типа; существующие тесты не меняются, вызов `list` остаётся `{ group, q, page }`). С `type` — без формы поиска и без `.library-browser__type`; `list` вызывается с `{ group: null, q: null, page, type }`; пустой список — `gameTypes.noExamples`. `useLibraryBrowser` получает `Ref<{ group: string | null; type?: ActivityKind }>`.

- [ ] **Step 1: тесты.** `libraryBrowser.nuxt.test.ts` — `it('по типу: без поиска и строки типа, страница 2 с тем же type')`: `list` вызван с `{ group: null, q: null, page: 1, type: 'matching' }`, затем после «Показать ещё» — `page: 2, type: 'matching'`; `form[role=search]` и `.library-browser__type` отсутствуют; `it('по типу: пусто — текст noExamples')`. `gameTypePage.nuxt.test.ts`: для `slug='true-false'` h1 `'Да/нет'`, текст `about`, ссылка «Создать задание в этой игре» с `href` `'/teacher/true-false/new'` (в en — `'/en/teacher/true-false/new'`), `LibraryBrowser` с `type='truefalse'`; для `slug='gaps'` — ошибка 404 (`createError`, поле `status` как читает `app/error.vue`).
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. `app/pages/games/[slug].vue` — тонкий: `<GameTypePage :slug="slug" />`, `definePageMeta({ name: 'game-type' })`. `GameTypePage`: `parseGameTypeSlug`; `null` → `throw createError({ status: 404, fatal: true })` в setup (SSR отдаёт 404). Порядок: крупное превью, h1, `about`, кнопка (`NuxtLink` на `localePath(newActivityPath(kind))`, вид — оранжевая основная кнопка проекта), h2 `gameTypes.examples`, `LibraryBrowser`. `useSeoMeta({ title: name })`, robots — как у страниц библиотеки (не задавать). Без ссылки «← Все игры».
- [ ] **Step 4:** PASS; `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<порт web>/games/abc` → `404`, `/games/quiz` → `200`. Браузер 390/375 — сверить с `screenshots/03-type-quiz-390.png`, `04-type-truefalse-empty-390.png`.

### Task 7: Блок «Познакомьтесь с нашими играми» на главной

**Files:**
- Create: `apps/web/src/widgets/game-types/GameTypes.vue`, `index.ts`, `gameTypes.nuxt.test.ts`
- Modify: `apps/web/src/pages/HomePage.vue` — `<GameTypes />` сразу после `<HowToStart />`

- [ ] **Step 1: тест:** h2 `'Познакомьтесь с нашими играми'`, подзаголовок из спеки; ссылки карточек по порядку `['/games/quiz', '/games/matching', '/games/true-false']`; в en — с префиксом `/en`.
- [ ] **Step 2:** FAIL. **Step 3:** секция в стиле соседних (`@include section`, `section-title`), список `GameTypeCard` с `to = localePath(gameTypePath(type))`. **Step 4:** PASS; браузер — сверить с `screenshots/02-home-390.png`, Tab по карточкам.

### Task 8: Документация

**Files:** `docs/architecture.md`

- [ ] **Step 1:** раздел «Типы игр»: каталог (`ACTIVITY_KINDS`, `GAME_TYPE_SLUGS`, `newActivityPath`), `entities/activity` (`GameTypePreview`, `GameTypeCard`), `/games/<slug>`, `LibraryBrowser` по типу, блок на главной; чек-лист «как добавить тип игры»: ключ в `ACTIVITY_KINDS` + CHECK в миграции, slug, `newActivityPath`, переводы `gameTypes.<kind>` ×4, рисунок в `GameTypePreview`, редактор, игра, `PlayPage`, `takenEditPath`, превью `toActivityThumbnail`.
- [ ] **Step 2:** финальная проверка по сигналу пользователя: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:integration -w apps/api`, `npm audit`; затем tester → code-reviewer.
