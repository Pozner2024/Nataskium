# Игра «да/нет» (`truefalse`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить третий тип задания «да/нет»: учитель создаёт 2–30 утверждений с ответом Да/Нет, ученик проходит их по ссылке, сервер проверяет и возвращает процент и оценку.

**Architecture:** Копирует модель сопоставления (ADR 0013): тип в колонке `quizzes.type`, содержимое в jsonb `questions`, отдельная API-фича, отдельные entity и виджеты, общая ссылка `/play/<token>`. Бэкенд пишется чистыми функциями (схема, «что отдать игроку», «как проверить»), чтобы шаг 2 (реестр типов, ADR 0017) перенёс их без переписывания.

**Tech Stack:** Hono, Prisma (миграция SQL вручную), Zod, Nuxt 4, Pinia, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-truefalse-design.md`

## Global Constraints

- От 2 до 30 утверждений (`MIN_TRUE_FALSE_ITEMS = 2`, `MAX_TRUE_FALSE_ITEMS = 30`), текст утверждения до 200 символов (`TRUE_FALSE_STATEMENT_MAX_LENGTH`).
- Повторы утверждений запрещены без учёта регистра, пробелов и формы Unicode (`matchingKey`), сообщение схемы `'Duplicate text'`.
- Правильные ответы не покидают сервер до проверки; `review` приходит только при `showAnswers: true`.
- Оценка по проценту через `summarizeQuiz`, верный ответ — `QUESTION_POINTS`, неверный или `null` — 0.
- Локали ru, en, de, fr: ключи добавляются во все четыре файла, существующие правки в них не трогать (в рабочем дереве есть чужие незакоммиченные изменения). После правки локалей перезапускать контейнер web.
- Вёрстка только мобильная; `Да`/`Нет` различаются значком и подписью, не только цветом.
- Новых зависимостей нет. Коммитов нет: после задач на 3+ файла предлагать пользователю git checkpoint, `git add` делает пользователь.
- Интеграционные тесты (`db-test` общая БД) запускает один исполнитель за раз.
- Существующие тесты викторины и сопоставления не переписывать и не удалять.

## Review Focus

1. В `GET /api/play/:token` для `truefalse` нигде нет правильных ответов: ни в `statements`, ни в других полях (Task 4).
2. `finish`: неверная длина, не-boolean, устаревшая `version` (409), частичные `null`, при `showAnswers: false` ключа `review` нет совсем; `check` при `showAnswers: false` даёт 404, индекс вне диапазона и отрицательный — 400 (Task 4).
3. Изоляция типов: id `truefalse` через `/api/quizzes/:id` и `/api/matchings/:id` даёт 404, id викторины и сопоставления через `/api/true-false/:id` тоже; чужой учитель — 404 (Task 3).
4. CHECK в БД отвергает 1 и 31 элемент и не-массив даже в обход Zod; старые строки `quiz` и `matching` не затронуты (Task 2).
5. Карточка библиотеки не содержит ответов, а «Взять себе» их копирует; непубличные и удалённые не видны (Task 5).

---

# Часть A — можно делать сейчас (не пересекается с player-embed)

### Task 1: Общие схемы (`packages/shared`)

**Files:**
- Create: `packages/shared/schemas/trueFalse.ts`, `packages/shared/schemas/trueFalse.test.ts`, `packages/shared/schemas/playActivity.ts`
- Modify: `packages/shared/schemas/activity.ts`, `matching.ts`, `library.ts`, `index.ts`, `packages/shared/routes/teacherPages.ts`

**Interfaces — Produces** (из `@nataskium/shared/schemas`):
- `ACTIVITY_KINDS = ['quiz', 'matching', 'truefalse']`, `TRUE_FALSE_ACTIVITY = 'truefalse'`
- `trueFalseItemSchema` = `{ statement: requiredText(200), answer: boolean }`
- `trueFalseInputSchema` = настройки (`title, showAnswers, gradingScale, group, timer` через `quizInputSchema.pick`) + `items`, `.strict()`; типы `TrueFalseItem`, `TrueFalseInput`
- `trueFalseResponseSchema` = `{ trueFalse: настройки + { id, shareToken, timer, items } }`
- `playTrueFalseResponseSchema` = `{ type: 'truefalse', trueFalse: { title, showAnswers, version, timer, statements: string[] } }`
- `playTrueFalseCheckInputSchema` = `{ version, index: int 0…MAX-1, answer: boolean }`; `playTrueFalseCheckResponseSchema` = `{ correct: boolean }`
- `playTrueFalseFinishInputSchema` = `{ version, answers: (boolean | null)[] }` (максимум `MAX_TRUE_FALSE_ITEMS`); `playTrueFalseFinishResponseSchema` = `{ result, review?: { correct: boolean; answer: boolean }[] }` (`answer` — правильный ответ)
- `playActivityResponseSchema` = union по `type` из quiz, matching, truefalse. Переезжает из `matching.ts` в `playActivity.ts`: в `activity.ts` его класть нельзя, получится цикл `activity → matching → quiz → library → activity`
- `libraryQuizResponseSchema.quiz` получает третью ветку `{ ...summary, type: 'truefalse', statements: string[] }`
- `TEACHER_PAGE_PATHS.trueFalseNew = '/teacher/true-false/new'`, `trueFalseEdit = '/teacher/true-false'`

- [ ] **Step 1: Тесты `trueFalse.test.ts`** (по образцу `matching.test.ts`):
  - `принимает 2 и 30 элементов`; `отклоняет 1 и 31`
  - `отклоняет повтор утверждения с другим регистром и лишними пробелами` (`'Земля круглая'` и `'  земля  КРУГЛАЯ '` → issue с path `['items', 1, 'statement']`, message `'Duplicate text'`)
  - `отклоняет утверждение длиной 201 и пустое`; `отклоняет answer не boolean`
  - `finish: answers допускает null, отклоняет 31 элемент и строки`; `check: index -1 и 30 отклоняются`
  - `playTrueFalseResponseSchema отклоняет лишнее поле answer` (схема `.strict()` на `trueFalse`)
- [ ] **Step 2:** `npm test -w @nataskium/shared -- schemas/trueFalse` → FAIL (модуля нет)
- [ ] **Step 3:** Реализовать схемы по блоку Interfaces; уникальность — `superRefine` с `matchingKey` (как в `matching.ts`); перенести union в `playActivity.ts`; обновить экспорты `index.ts` (`PlayActivityResponse` экспортируется оттуда же); добавить ветку в `library.ts`; добавить пути в `teacherPages.ts`
- [ ] **Step 4:** `npm test -w @nataskium/shared` и `npm run typecheck -w @nataskium/shared` → PASS (старые тесты без правок)

### Task 2: Миграция БД

**Files:** Create `apps/api/prisma/migrations/20261119120000_add_truefalse_type/migration.sql`; Test: `apps/api/tests/integration/constraints.int.test.ts`, `apps/api/tests/migrations.test.ts` (если перечисляет миграции)

- [ ] **Step 1: Тесты в `constraints.int.test.ts`:** вставка `type='truefalse'` с 1, 31 элементом и с `questions = '{}'` падает на `quizzes_truefalse_items_check`; с 2 и 30 проходит; `type='bogus'` падает на `quizzes_type_check`; существующие `quiz`/`matching` строки вставляются как раньше
- [ ] **Step 2:** Запустить → FAIL
- [ ] **Step 3:** SQL по образцу `add_quiz_type` (заголовок с рисками и ручным откатом сохранить): `DROP CONSTRAINT quizzes_type_check`, `ADD CONSTRAINT quizzes_type_check CHECK ("type" IN ('quiz','matching','truefalse'))`, `quizzes_truefalse_items_check` через `CASE WHEN jsonb_typeof("questions") = 'array' THEN jsonb_array_length("questions") BETWEEN 2 AND 30 ELSE false END` (CASE, а не AND — причина в комментарии старой миграции). Комментарий: границы дублируют `MIN/MAX_TRUE_FALSE_ITEMS`
- [ ] **Step 4:** `npm run db:deploy -w @nataskium/api` на тестовой БД, затем интеграционные тесты → PASS

### Task 3: API кабинета `/api/true-false`

**Files:**
- Create: `apps/api/src/features/trueFalse/{types.ts,index.ts}`, `application/{createTrueFalse,getTrueFalse,updateTrueFalse,deleteTrueFalse,trueFalseErrors}.ts`, `infrastructure/trueFalseRepository.ts`, `presentation/trueFalseRoutes.ts`; Test: `apps/api/tests/trueFalse.test.ts`, `apps/api/tests/integration/trueFalseRoutes.int.test.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/tests/integration/activityTypeIsolation.int.test.ts`

**Interfaces — Produces:**
- `type StoredTrueFalse = TrueFalseInput & { id: string; shareToken: string; updatedAt: Date }`
- `TrueFalseRepository`: те же методы и сигнатуры, что у `MatchingRepository` (`countByTeacher, groupExists, findOwned, create, updateOwned, softDeleteOwned, findByShareToken`), фильтр по `TRUE_FALSE_ACTIVITY`
- `makeCreateTrueFalse(deps)`, `makeGetTrueFalse`, `makeUpdateTrueFalse`, `makeDeleteTrueFalse` — сигнатуры как у matching; `makeCreateTrueFalse` принимает `options: { isPublic?: boolean }`
- `TRUE_FALSE_ROUTES_BASE_PATH = '/api/true-false'`, `makeTrueFalseRouter`; те же `teacherActivityLimiters`, что у matchings; ответ строится явно, без `updatedAt`
- В `app.ts` маршрут подключается рядом с matchings (около строки 342)

- [ ] **Step 1: Unit-тесты `trueFalse.test.ts`** (по образцу `matchings.test.ts`, фейковый репозиторий): `create отклоняет неизвестный раздел (400)`; `create на 100-м задании даёт 409`; `get чужого задания даёт 404`; `update/delete чужого — 404`
- [ ] **Step 2: Интеграционные `trueFalseRoutes.int.test.ts`:** создание → `GET` возвращает items с `answer`; `GET /api/quizzes` содержит задание с `type: 'truefalse'` и `questionCount` = числу утверждений; невалидный id → 404; без токена → 401
- [ ] **Step 3: Изоляция в `activityTypeIsolation.int.test.ts`:** id `truefalse` на `/api/quizzes/:id` и `/api/matchings/:id` → 404, id викторины и сопоставления на `/api/true-false/:id` → 404
- [ ] **Step 4:** Запустить → FAIL
- [ ] **Step 5:** Реализовать фичу по образцу `features/matchings`: в репозитории `toStoredTrueFalse` разбирает строку `trueFalseInputSchema` (рассинхрон → `Error`/500), содержимое — колонка `questions`
- [ ] **Step 6:** `npm test -w @nataskium/api`, `npm run test:integration -w @nataskium/api`, `npm run typecheck -w @nataskium/api` → PASS

### Task 4: API игры (`play`)

**Files:**
- Create: `apps/api/src/features/play/application/{gradeTrueFalse,checkTrueFalse,finishTrueFalse}.ts`; Test: `apps/api/tests/playTrueFalse.test.ts`, `apps/api/tests/integration/playTrueFalseRoutes.int.test.ts`
- Modify: `play/types.ts`, `play/application/getPlayActivity.ts`, `play/presentation/playRoutes.ts`, `play/index.ts`, `apps/api/src/app.ts`

**Interfaces — Produces:**
- `PlayableTrueFalse = Pick<TrueFalseInput, 'title' | 'showAnswers' | 'timer' | 'items'> & { gradingScale: GradingScaleType | null; updatedAt: Date }`; `PlayTrueFalseSource = { findByShareToken(token): Promise<PlayableTrueFalse | null> }`
- `toPlayTrueFalseResponse(tf: PlayableTrueFalse): PlayTrueFalseResponse` (чистая, в `getPlayActivity.ts`; порядок учителя, без перемешивания, без `answer`)
- `gradeTrueFalse(items: readonly { answer: boolean }[], answers: readonly (boolean | null)[]): boolean[]` (чистая)
- `makeCheckTrueFalse(deps: { trueFalses: PlayTrueFalseSource })`: `(shareToken, input: PlayTrueFalseCheckInput) => Promise<PlayTrueFalseCheckResponse>`; `showAnswers: false` → `playQuizNotFound()`; устаревшая версия → `playVersionConflict()`; индекс вне диапазона → `playInvalid`
- `makeFinishTrueFalse(deps)`: `(shareToken, input) => Promise<PlayTrueFalseFinishResponse>`; неверная длина → `playInvalid`; `review` только при `showAnswers`
- `makeGetPlayActivity` получает `deps.trueFalses` и третий поиск после викторины и сопоставления (лишний индексный запрос, объединение запросов — шаг 2)
- Маршруты: `POST /:shareToken/true-false/check` (лимитер `check`), `POST /:shareToken/true-false/finish` (лимитер `finish`)

- [ ] **Step 1: Unit-тесты `playTrueFalse.test.ts`** (по образцу `playMatching.test.ts`):
  - `GET отдаёт statements в порядке учителя и не содержит ключа answer` (`JSON.stringify(response)` не содержит `"answer"` и `"items"`)
  - `gradeTrueFalse: items с ответами [true,false,true] против answers [true,true,null] даёт [true,false,false]`
  - `finish: 3 верных из 4 → percent 75`, `null` считается неверным
  - `finish при showAnswers=false: в ответе нет ключа review` (`'review' in response === false`)
  - `finish при showAnswers=true: review[i] = { correct, answer }`
  - `finish: длина 2 вместо 3 → 400`, `устаревшая version → 409`, `невалидный токен → 404 без обращения к источнику`
  - `check при showAnswers=false → 404`; `check index -1 / 3 из 3 → 400`; `check верный ответ → { correct: true }`
- [ ] **Step 2: Интеграционные `playTrueFalseRoutes.int.test.ts`:** ответ `GET /api/play/:token` проходит `playActivityResponseSchema` и `playTrueFalseResponseSchema`; удалённое задание → 404; токен сопоставления на `/true-false/finish` → 404 и наоборот; 121-й `finish` с одного IP → 429
- [ ] **Step 3:** Запустить → FAIL
- [ ] **Step 4:** Реализовать; `finishTrueFalse` строит баллы через `summarizeQuiz`; провязать `trueFalses` репозиторий в `app.ts` (около строк 384–387)
- [ ] **Step 5:** Все API-тесты, интеграционные и typecheck → PASS

### Task 5: Библиотека (API)

**Files:** Modify `apps/api/src/features/library/{types.ts,application/toLibrarySummary.ts,application/getLibraryQuiz.ts,application/takeLibraryQuiz.ts}`, `apps/api/src/app.ts` (около строки 421); Test: `apps/api/tests/takeLibraryTrueFalse.test.ts`, `apps/api/tests/integration/libraryTrueFalse.int.test.ts`, `apps/api/tests/libraryUnknownType.test.ts`

**Interfaces:** `LibraryCreateTrueFalseCopy = (teacherId, input: TrueFalseInput, options: { isPublic: boolean }) => Promise<{ id: string }>`; `parseTrueFalseItems(row: LibraryQuizRow): TrueFalseItem[]`; `takeLibraryQuiz` получает `deps.createTrueFalse`; `getLibraryQuiz` для `truefalse` отдаёт `statements` и **никогда** `answer`

- [ ] **Step 1: Тесты:** `карточка truefalse: statements по порядку, JSON не содержит answer`; `take копирует items с ответами и создаёт непубличную копию, возвращает { quizId, type: 'truefalse' }`; `take сверх 100 заданий → 409`; `непубличное и удалённое не видны`; `список содержит type и questionCount`; `libraryUnknownType` по-прежнему падает на неизвестном типе (500)
- [ ] **Step 2:** FAIL → реализовать (ветка по `TRUE_FALSE_ACTIVITY` рядом с matching) → все тесты и typecheck PASS

### Task 6: Кабинет учителя: регистрация типа во фронтенде

**Files:** Create `apps/web/src/entities/true-false/{trueFalseApi,newTrueFalse,types,index}.ts` и `trueFalseApi.nuxt.test.ts`. Modify `entities/activity/{types,activityTypes}.ts`, `ActivityTypeIcon.vue` (если иконки зависят от типа), `ActivityCard.vue`, `pages/TeacherCreatePage.vue`, `widgets/my-activities/{ManageActivities.vue,useMyActivities.ts}`, `features/take-library-quiz/takenEditPath.ts`, `widgets/library-browser/LibraryBrowser.vue`, web `TEACHER_PATHS` (в `@/shared`), четыре локали

**Interfaces — Produces:**
- `trueFalseApi = { get, create, update, remove }` — сигнатуры как у `matchingApi`, путь `/true-false`
- `newTrueFalse(): TrueFalseInput` — два пустых утверждения (`{ statement: '', answer: true }`), `group: ''`, `timer: { mode: 'none' }`, `showAnswers: true`; `newItem()`
- `ActivityType` += `'truefalse'`; `ACTIVITY_TYPES.truefalse` (простой SVG-путь, цвет на выбор исполнителя в рамках бренда); порядок `['quiz', 'matching', 'truefalse', 'gaps', 'pictures']`
- Тернарии `type === 'matching' ? … : …` в затрагиваемых местах (`useMyActivities`, `ManageActivities`, `takenEditPath`, `ActivityCard`, `LibraryBrowser`) заменить на `Record<ActivityType, …>` или `Record<ActivityKind, …>`
- Ключи локалей: `teacher.activityTypes.truefalse.{name,description}`, `teacher.activities.statements` (с plural `count`), `library.statements`

- [ ] **Step 1: Тесты:** `trueFalseApi: create шлёт POST /api/true-false с Bearer; get экранирует id; ответ не по схеме — ошибка; remove принимает 204`; `newTrueFalse: два разных объекта, группа пустая`; `takenEditPath: truefalse → /teacher/true-false/<id>`; `useMyActivities: удаление truefalse идёт через trueFalseApi`; `ActivityTypePicker показывает три плитки по порядку`
- [ ] **Step 2:** FAIL → реализовать → `npm test -w @nataskium/web -- <файлы>`, `npm run typecheck -w @nataskium/web` → PASS

### Task 7: Редактор «да/нет»

**Files:** Create `apps/web/src/widgets/true-false-editor/{TrueFalseEditor.vue,store.ts,trueFalseErrors.ts,index.ts,trueFalseEditor.nuxt.test.ts,store.nuxt.test.ts}`, `components/{StatementCard.vue,TrueFalseSettings.vue}`; `apps/web/src/pages/TrueFalseEditorPage.vue`; `apps/web/app/pages/teacher/true-false/{new.vue,[id].vue}` (тонкие, `definePageMeta` с именами `teacher-true-false-new` / `teacher-true-false-edit`, `layout: 'teacher'`, `middleware: 'teacher-auth'`). Modify `features/activity-settings/ActivitySettings.vue` (ветка `kind === 'truefalse'` в `hintKeys`), локали

**Interfaces:** `useTrueFalseEditorStore` — тот же набор состояний, что у `useMatchingEditorStore` (`loadStatus, saveStatus, view, fieldErrors, isDirty`), плюс `items`, `canAddItem`, `canRemoveItem`, `addItem()`, `removeItem(index)`, `setAnswer(index, answer: boolean)`; ошибки полей по пути `items.<i>.statement`; `issueText` как в `matchingErrors.ts` с ключами `teacher.trueFalseEditor.errors.*`. Карточка утверждения: textarea + переключатель «Да / Нет» (радиокнопки с подписью и значком) + удаление; кнопка «Добавить утверждение» скрыта на 30; удаление скрыто на 2

- [ ] **Step 1: Тесты store:** `старт — два пустых утверждения`; `addItem не выходит за 30`; `removeItem не опускается ниже 2`; `дубликат утверждения даёт ошибку на втором, partner на первом`; `сохранение создаёт, затем обновляет (create → update с тем же id)`; `409 лимита → saveStatus limitReached`; `isDirty после правки`
- [ ] **Step 2: Тесты виджета:** `рендерит карточки и переключатель Да/Нет, у каждой радиокнопки есть подпись`; `клик по «Добавить» добавляет карточку и переводит фокус в неё`; `ошибка поля связана через aria-describedby`; `после сохранения показана ссылка на задание`
- [ ] **Step 3:** FAIL → реализовать по образцу `widgets/matching-editor` (используя `ActivitySettings`, `GroupSelect`) → тесты, typecheck, `npm run lint -w apps/web` → PASS
- [ ] **Step 4:** Перезапустить web-контейнер, пройти руками `/teacher/create` → «Да/нет» → сохранить → открыть из списка

### Task 8: Карточка библиотеки (фронтенд)

**Files:** Create `apps/web/src/widgets/library-quiz/components/LibraryTrueFalsePreview.vue`, `libraryTrueFalse.nuxt.test.ts`; Modify `LibraryQuiz.vue`, локали (`library.trueFalse.previewTitle`)

- [ ] **Step 1: Тесты:** `показывает все утверждения по порядку без ответов`; `кнопка «Взять себе» ведёт в /teacher/true-false/<id>`
- [ ] **Step 2:** FAIL → реализовать по образцу `LibraryMatchingPreview.vue` → PASS

---

# Часть B — только после завершения player-embed

Перед стартом: перечитать актуальные `PlayPage.vue`, `widgets/matching-play`, `features/play-session` (`PLAY_TIMER_KEY`, `PlayTimerPortal`, `playerKeys`) и писать экран игры под итоговую схему проигрывателя.

### Task 9: Игра «да/нет» (фронтенд)

**Files:** Create `apps/web/src/entities/true-false/trueFalsePlayApi.ts` (+ тест), `apps/web/src/widgets/true-false-play/{TrueFalsePlay.vue,store.ts,useTrueFalsePlayTimer.ts,index.ts}`, `components/{StatementCard,AnswerButtons,TrueFalseResult,ReviewRow}.vue`, тесты рядом, `apps/web/tests/e2e/trueFalse.spec.ts`. Modify `pages/PlayPage.vue` (третья ветка `kind: 'truefalse'`), `pages/playPage*.nuxt.test.ts`, локали (`play.trueFalse.*`, `play.intro.trueFalseType/Hint`)

**Interfaces:** `trueFalsePlayApi.check(token, { version, index, answer }): Promise<{ correct: boolean }>`, `trueFalsePlayApi.finish(token, { version, answers }): Promise<PlayTrueFalseFinishResponse>` (пути `/play/<token>/true-false/{check,finish}`, токен экранируется); store: `answers: (boolean | null)[]`, `current: number`, `answer(value: boolean)`, `next()`, `finish()`; при `showAnswers` ответ отправляется в `check`, после чего смена ответа на это утверждение заблокирована

- [ ] **Step 1: Тесты store и виджета:** `ответ Да/Нет переходит к следующему при showAnswers=false`; `при showAnswers=true после ответа видно верно/неверно и кнопка «Дальше», кнопки заблокированы`; `после последнего утверждения вызывается finish с answers по порядку`; `409 на finish показывает сообщение «задание изменилось»`; `таймер limit: по истечении finish с null у неотвеченных`; `кнопки различаются значком и подписью`; `у результата h1 получает фокус`
- [ ] **Step 2: PlayPage:** `ответ GET type=truefalse рендерит TrueFalsePlay`, существующие тесты диспетчера проходят
- [ ] **Step 3: e2e `trueFalse.spec.ts`:** учитель создаёт задание → ученик проходит по ссылке → видит процент и оценку
- [ ] **Step 4:** FAIL → реализовать → `npm test -w @nataskium/web`, typecheck, lint, e2e → PASS

### Task 10: Документация

**Files:** Create `docs/adr/0016-true-false-activity.md` (шаблон из `docs/adr/README.md`: решение, три рассмотренных подхода, принятый риск подбора ответов как расширение ADR 0013 с тем же лимитом `finish` 120/мин, ссылка на будущий ADR 0017). Modify `docs/architecture.md` (разделы про типы заданий, `/api/true-false`, маршруты `play`, модель `quizzes`: тип и CHECK, лимиты), индекс в `docs/adr/README.md` (если он есть)

- [ ] **Step 1:** Написать ADR и обновить разделы архитектуры; статус ADR `Accepted` ставит пользователь
- [ ] **Step 2: Финальная проверка:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration -w @nataskium/api`, `npm audit` (зависимостей не добавлялось, high/critical блокируют коммит); предложить запуск агентов `tester` и `code-reviewer`
