# Превью заданий в библиотеке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** в списке раздела библиотеки у каждого задания — миниатюра первого вопроса в визуальном стиле задания и переключатель «плиткой / списком».

**Architecture:** API списка дописывает к каждому заданию `introTheme` и `thumbnail` (начало задания без правильных ответов), достаёт из jsonb только первые 3 элемента. На фронте `IntroThemePreview` получает слот, `LibraryThumbnail` вставляет в него текст по типу задания, `LibraryBrowser` переключает вид, выбор хранится в `localStorage`.

**Tech Stack:** Zod (packages/shared), Hono + Prisma `$queryRaw` + Postgres jsonb (apps/api), Nuxt 4 / Vue 3 / SCSS BEM / @nuxt/test-utils (apps/web).

**Spec:** `docs/superpowers/specs/2026-11-23-library-preview-design.md`

## Global Constraints

- Ни правильных ответов (`isCorrect`, `answer`), ни слов сопоставления (`term`), ни данных автора, id, shareToken в ответе списка.
- Сопоставление в превью — только до 3 определений; слова не отдаются вовсе (ADR-0013).
- `introTheme` вне `INTRO_THEME_KEYS` → `DEFAULT_INTRO_THEME_KEY`, не 500. Остальной рассинхрон данных — 500 (обычный `Error`, не `AppError`), текст задания в сообщение ошибки не попадает.
- `IntroThemePreview` без слота выглядит и рендерится ровно как сейчас (настройки задания, «Визуальный стиль»).
- Без анимаций в миниатюре; миниатюра `aria-hidden`.
- Только мобильная вёрстка. BEM в `<style scoped lang="scss">`, цвета с прозрачностью `rgb(... / a)`, без `v-html`.
- ФСД: импорт только вниз, только через `index.ts`; entities не импортируют entities.
- Тексты — в 4 локали (ru, en, de, fr); после правки локалей перезапустить контейнер web.
- Без новых зависимостей. Без магических чисел.
- **Коммиты и `git add` не делать** — индекс и коммиты делает пользователь. Вместо шага «Commit» — шаг «Checkpoint»: показать `git diff --stat` и остановиться только если что-то не так.
- Интеграционные тесты (`test:integration`) — общая база `db-test`: запускать только когда больше никто не гоняет интеграцию.
- Правка существующих рабочих тестов — только там, где план это прямо называет (меняется форма ответа); ничего не удалять.

## Review Focus

1. Викторина с пустым массивом вопросов (бывает: «В этом задании пока нет вопросов») → `thumbnail: null`, на фронте миниатюра-заглушка с полосками, без ошибки. → тест в Task 2 и Task 4.
2. Вариант только с картинкой (`text: ''`) → пустая плашка, не пропуск и не падение. → тест в Task 2 (сервер оставляет `''`) и Task 4 (рендер 4 плашек).
3. Длинный текст / длинное слово без пробелов → обрезка сервером с «…» и `overflow-wrap: anywhere` + `line-clamp` в миниатюре, карточка не раздувается. → тест обрезки в Task 1.
4. `localStorage` недоступен (бросает) или в нём мусор → вид «плиткой», без ошибки. → тест в Task 5.
5. Картинка вопроса не открылась → блок картинки скрыт, текст на месте. → тест в Task 4.

---

### Task 1: Схема ответа списка с превью (packages/shared)

**Files:**
- Modify: `packages/shared/schemas/library.ts`
- Modify: `packages/shared/schemas/index.ts` (экспорт новых имён)
- Test: `packages/shared/schemas/library.test.ts` (создать, если нет; если есть — дописать `describe`)

Лимиты превью живут в shared, а не в `limits.ts` API (как в спеке): по ним же `.max()` в схеме ответа — уточнение строителя.

**Interfaces:**
- Produces:
  - константы `LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH = 120`, `LIBRARY_THUMBNAIL_OPTION_MAX_LENGTH = 40`, `LIBRARY_THUMBNAIL_OPTIONS = 4`, `LIBRARY_THUMBNAIL_DEFINITIONS = 3`;
  - `clipThumbnailText(text: string, maxLength: number): string` — если длиннее, режет по code points до `maxLength - 1` и добавляет `…` (итог ровно `maxLength` символов); иначе возвращает как есть;
  - `libraryThumbnailSchema` — `z.discriminatedUnion('type', [...])`:
    - `{ type: 'quiz', text: string(max TEXT), imageUrl: imageUrlSchema, options: array({ text: string(max OPTION) }).max(OPTIONS) }`
    - `{ type: 'truefalse', statement: string(max TEXT) }`
    - `{ type: 'matching', definitions: array(string(max TEXT)).max(DEFINITIONS) }`
    все объекты `.strict()`;
  - `libraryListItemSchema = libraryQuizSummarySchema.extend({ introTheme: introThemeKeySchema, thumbnail: libraryThumbnailSchema.nullable() })`;
  - `libraryListResponseSchema.quizzes` → `z.array(libraryListItemSchema)`;
  - типы `LibraryThumbnail`, `LibraryListItem`.
  - `libraryQuizSummarySchema` и карточки (`libraryQuizCardSchema` и др.) **не меняются**.

- [ ] **Step 1: Тесты**
  - `clipThumbnailText('абв', 5) === 'абв'`; `clipThumbnailText('a'.repeat(130), 120)` — длина 120, оканчивается на `'…'`; эмодзи не разрезается пополам (`[...result].length === 120` для строки из 130 `'😀'`).
  - `libraryThumbnailSchema` отклоняет `{ type: 'matching', definitions: [...], terms: [...] }` (strict) и `{ type: 'truefalse', statement, answer: true }`; отклоняет `options` длиной 5.
  - `libraryListItemSchema` принимает `thumbnail: null`.
- [ ] **Step 2:** `npm run test -w packages/shared -- library` — FAIL (нет экспорта).
- [ ] **Step 3:** реализовать в `library.ts` (импорт `introThemeKeySchema` из `./introTheme`), экспорт в `index.ts`.
- [ ] **Step 4:** тот же запуск — PASS; `npm run typecheck -w packages/shared` (если у пакета есть скрипт; иначе `npm run typecheck` в корне покажет ожидаемые ошибки в api/web — их чинят Task 2–5).
- [ ] **Step 5: Checkpoint** (`git diff --stat`).

### Task 2: API — превью в списке

**Files:**
- Modify: `apps/api/src/features/library/types.ts` — `LibraryQuizListRow` += `introTheme: string`, `head: unknown[]`
- Modify: `apps/api/src/features/library/infrastructure/libraryRepository.ts` — `listRowSchema` и SQL
- Create: `apps/api/src/features/library/application/toLibraryThumbnail.ts`
- Modify: `apps/api/src/features/library/application/listLibraryQuizzes.ts` — deps += `imageUrl: LibraryImageUrl`
- Modify: `apps/api/src/app.ts:450` — `makeListLibraryQuizzes({ library, imageUrl })`
- Test: `apps/api/tests/libraryThumbnail.test.ts` (создать, unit, фейковый репозиторий)
- Test: `apps/api/tests/integration/libraryList.int.test.ts` (правка существующего: `SUMMARY_KEYS` и ожидаемый объект в тесте «поля карточки — ровно публичные» дополняются `introTheme` и `thumbnail`; плюс новые тесты)

**Interfaces:**
- Consumes: Task 1 — `libraryThumbnailSchema`, `clipThumbnailText`, константы, `LibraryListItem`.
- Produces: `toLibraryThumbnail(row: LibraryQuizListRow, imageUrl: LibraryImageUrl): LibraryThumbnail | null`; `makeListLibraryQuizzes(deps: { library: LibraryRepository; imageUrl: LibraryImageUrl })` → элементы `LibraryListItem`.

SQL (в `list`, внешний SELECT): добавить
`q.intro_theme AS "introTheme"` и
`CASE WHEN jsonb_typeof(q.questions) = 'array' THEN jsonb_path_query_array(q.questions, '$[0 to 2]') END AS head`.
`listRowSchema`: `introTheme: introThemeKeySchema.catch(DEFAULT_INTRO_THEME_KEY)`, `head: z.array(z.unknown())` (NULL → ошибка схемы → 500, как сейчас с `questionCount`).

`toLibraryThumbnail`: пустой `head` → `null`. Иначе разбор по `row.type` поэлементными схемами: `z.array(quizQuestionSchema)` / `z.array(trueFalseItemSchema)` / `z.array(matchingPairSchema)` (не схемами всего задания — у них `min`); провал → `throw new Error(\`Library ${type} ${row.number} does not match the thumbnail schema\`)` без текста. Поля собираются явно:
- quiz: первый вопрос; `text` → clip(TEXT); `imageUrl` → `imageId === null ? null : imageUrl(imageId)`; `options` → первые `LIBRARY_THUMBNAIL_OPTIONS`, только `{ text: clip(OPTION) }`;
- truefalse: `{ statement: clip(TEXT) }` первого;
- matching: `definitions` — до `LIBRARY_THUMBNAIL_DEFINITIONS`, clip(TEXT).

- [ ] **Step 1: Unit-тесты `libraryThumbnail.test.ts`** (через `makeListLibraryQuizzes` с фейковым `list`, `groupExists`, и `imageUrl: (id) => \`https://img.test/${id}\``):
  - викторина с 6 вариантами (`isCorrect` у некоторых) → 4 варианта; `JSON.stringify(result)` не содержит `isCorrect`; `imageUrl` вопроса = `https://img.test/<id>`; вариант с `text: ''` и картинкой → `{ text: '' }`;
  - «да/нет» → `{ type: 'truefalse', statement }`, в JSON нет `answer`;
  - сопоставление с 3 парами `term: 'СЛОВО-1'…` → `definitions` длиной 3, в JSON нет ни одного `СЛОВО-` и нет `term`;
  - `head: []` → `thumbnail: null`;
  - `introTheme` у строки — уже разобранный ключ (fallback проверяется в интеграции);
  - `head` неверной формы (например `[{ foo: 1 }]` у quiz) → ошибка не `AppError`, сообщение не содержит текста задания.
- [ ] **Step 2:** `npm run test -w apps/api -- libraryThumbnail` — FAIL.
- [ ] **Step 3:** реализовать `toLibraryThumbnail.ts`, `listLibraryQuizzes.ts` (элемент = `{ ...toLibrarySummary(row, row.questionCount), introTheme: row.introTheme, thumbnail: toLibraryThumbnail(row, deps.imageUrl) }`), `types.ts`, `app.ts`. Экспорт из `features/library/index.ts` — только если тесту нужен (`makeListLibraryQuizzes` уже экспортируется).
- [ ] **Step 4:** `npm run test -w apps/api -- libraryThumbnail` — PASS; `npm run typecheck -w apps/api` — без ошибок.
- [ ] **Step 5: Интеграция (сначала убедиться, что `db-test` свободна).** В `libraryList.int.test.ts`:
  - `SUMMARY_KEYS` += `'introTheme'`, `'thumbnail'` (отсортировано); ожидаемый объект += `introTheme: 'nataskium-night'`, `thumbnail: { type: 'quiz', text: 'Вопрос', imageUrl: null, options: [{ text: 'Да' }, { text: 'Нет' }] }`;
  - новый: задание из 5 вопросов → `thumbnail.text` равен тексту **первого**;
  - новый: `intro_theme = 'gone-theme'` (через `prisma.$executeRaw` UPDATE) → 200 и `introTheme: 'nataskium-night'`;
  - новый: сопоставление (`type: 'matching'`, пары с уникальными `term`) → тело ответа не содержит ни одного `term`;
  - новый: `questions: []` → `thumbnail: null`.
  Run: `npm run test:integration -w apps/api -- libraryList` — PASS.
- [ ] **Step 6: Checkpoint.**

### Task 3: Слот в `IntroThemePreview`

**Files:**
- Modify: `apps/web/src/entities/intro-theme/IntroThemePreview.vue`
- Test: `apps/web/src/entities/intro-theme/introThemePreview.nuxt.test.ts` (создать)

**Interfaces:**
- Produces: `<IntroThemePreview :tone>` с default-слотом. Слот заменяет `__question` и `__options` внутри `__card`; `__pcb`, `__card` (рамка) и `__dots` остаются. Содержимому слота доступны `--preview-text`, `--preview-surface`, `--preview-line` (уже на корне). `__card` получает `overflow: hidden` и `min-width: 0`.

- [ ] **Step 1: Тесты:** без слота есть `.intro-theme-preview__question` и 4 `.intro-theme-preview__options i`; со слотом `<b class="x">` — `.x` внутри `.intro-theme-preview__card`, `__question` отсутствует, `__dots` есть; корень `aria-hidden="true"` в обоих случаях.
- [ ] **Step 2:** `npm run test -w apps/web -- introThemePreview` — FAIL на тесте со слотом.
- [ ] **Step 3:** `<slot>` с прежними `__question`/`__options` как fallback-содержимым.
- [ ] **Step 4:** тот же запуск — PASS; `npm run test -w apps/web -- playPanel activitySettings` — существующие тесты зелёные.
- [ ] **Step 5: Checkpoint.**

### Task 4: `LibraryQuizThumbnail` — миниатюра по типу задания

**Files:**
- Create: `apps/web/src/widgets/library-browser/components/LibraryQuizThumbnail.vue`
- Modify: `apps/web/src/entities/library/types.ts`, `apps/web/src/entities/library/index.ts` — реэкспорт `LibraryListItem`, `LibraryThumbnail`
- Modify: локали `apps/web/src/shared/i18n/locales/{ru,en,de,fr}.ts` — `library.thumbnail.yes` / `no` (ru: «Да» / «Нет»; en: «True» / «False»; de: «Wahr» / «Falsch»; fr: «Vrai» / «Faux»)
- Test: `apps/web/src/widgets/library-browser/libraryQuizThumbnail.nuxt.test.ts`

**Interfaces:**
- Consumes: Task 1 типы, Task 3 слот, `findTheme` из `@/entities/intro-theme`.
- Produces: `<LibraryQuizThumbnail :thumbnail="LibraryThumbnail | null" :intro-theme="IntroThemeKey" />`.

Вёрстка внутри слота (всё мелкое, `font-size` от ширины — `container-type: inline-size` на корне миниатюры и `cqw`; именованные SCSS-переменные):
- quiz: картинка (если есть, `loading="lazy"`, `@error` → скрыть) или текст вопроса (`line-clamp: 2`), ниже сетка 2×2 плашек (`--preview-surface`, рамка `--preview-line`), текст `line-clamp: 1`;
- truefalse: утверждение (`line-clamp: 3`) и две плашки: зелёная «Да», оранжевая «Нет»;
- matching: ряд из 3 пустых плашек сверху, ниже до 3 строк определений (`line-clamp: 1`);
- `thumbnail === null` → `IntroThemePreview` без слота (полоски).
Везде `overflow-wrap: anywhere`. Без transition/animation.

- [ ] **Step 1: Тесты:** тон берётся из стиля (`nataskium-day` → `.intro-theme-preview--light`, неизвестный → `--dark`); quiz — текст вопроса и 4 плашки, вариант `''` даёт пустую плашку; картинка → `img[loading=lazy]`, после `trigger('error')` img исчезает, текст вопроса виден; truefalse — утверждение, «Да»/«Нет»; matching — 3 определения, 3 плашки без текста; `null` → есть `.intro-theme-preview__question`.
- [ ] **Step 2:** `npm run test -w apps/web -- libraryQuizThumbnail` — FAIL.
- [ ] **Step 3:** реализовать компонент, типы, локали.
- [ ] **Step 4:** тот же запуск — PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: Переключатель вида и карточки в `LibraryBrowser`

**Files:**
- Create: `apps/web/src/widgets/library-browser/useLibraryView.ts`
- Create: `apps/web/src/widgets/library-browser/components/LibraryViewToggle.vue`
- Modify: `apps/web/src/widgets/library-browser/LibraryBrowser.vue`
- Modify: `apps/web/src/widgets/library-browser/useLibraryBrowser.ts` — `quizzes: Ref<LibraryListItem[]>`
- Modify: локали — `library.view.label` («Вид списка»), `library.view.tiles` («Плиткой»), `library.view.list` («Списком») во всех 4
- Test: `apps/web/src/widgets/library-browser/useLibraryView.nuxt.test.ts` (создать)
- Test: `apps/web/src/widgets/library-browser/libraryBrowser.nuxt.test.ts` (правка существующего: хелпер `summary()` возвращает `LibraryListItem` с `introTheme: 'nataskium-night'`, `thumbnail: null`; плюс новые тесты)

**Interfaces:**
- Produces: `type LibraryView = 'tiles' | 'list'`; `useLibraryView(): { view: Ref<LibraryView>; setView(next: LibraryView): void }`; ключ `LIBRARY_VIEW_STORAGE_KEY = 'nataskium.library-view'`; по умолчанию `'tiles'`; чтение в `onMounted` (SSR-безопасно), запись в `setView`; любые исключения `localStorage` глотаются.
- `<LibraryViewToggle :view @update:view>` — `role="group"` с `aria-label` = `library.view.label`, две кнопки с видимой иконкой (inline SVG) и подписью, `aria-pressed`, зона касания ≥ 44px.

Карточка: ссылка-заголовок остаётся растянутой на всю карточку (`::after`), миниатюра — первый ребёнок карточки.
- `--tiles`: колонка, миниатюра во всю ширину, под ней текст как сейчас;
- `--list`: `grid-template-columns: minmax(0, 1fr) minmax(0, 2fr)`, миниатюра слева.
Название раздела в `__meta` остаётся как есть.

- [ ] **Step 1: Тесты `useLibraryView`:** по умолчанию `tiles`; `localStorage` = `'list'` → `list` после mount; мусор → `tiles`; `setView('list')` пишет ключ; `getItem`/`setItem` бросают → без исключения, вид `tiles` / меняется в памяти.
- [ ] **Step 2: Тесты `LibraryBrowser` (новые):** у каждой карточки есть `.intro-theme-preview`; по умолчанию список с модификатором `--tiles`, `aria-pressed="true"` у «Плиткой»; клик «Списком» → модификатор `--list` и `aria-pressed` переключился; существующие тесты ссылок проходят.
- [ ] **Step 3:** `npm run test -w apps/web -- library-browser useLibraryView` — FAIL на новых.
- [ ] **Step 4:** реализовать.
- [ ] **Step 5:** тот же запуск — PASS; `npm run typecheck`, `npm run lint` в корне — без ошибок.
- [ ] **Step 6: Checkpoint.**

### Task 6: Проверка в браузере

- [ ] **Step 1:** перезапустить контейнер web (локали). Открыть `/library/<раздел>` на ширине 375px с заданиями трёх типов, в стилях «ночь» и «день», с картинкой и без.
- [ ] **Step 2:** проверить: миниатюры в стиле задания; длинный текст не раздувает карточку; переключатель меняет вид и переживает перезагрузку; `IntroThemePreview` в настройках задания и «Визуальный стиль» на `/play/:token` не изменились (скриншот до/после).
- [ ] **Step 3:** отчёт пользователю со скриншотами. Тестер и ревьюер — по сигналу пользователя.
