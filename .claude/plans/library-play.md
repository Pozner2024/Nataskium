# План: игра из библиотеки вместо страницы со списком вопросов

## Цель
Клик по заданию в библиотеке открывает саму игру (викторина, сопоставление, да/нет) по адресу `/library/quiz/<номер>-<slug>` через новые публичные маршруты `/api/library/play/<номер>`. Страница со списком вопросов удаляется, «Взять себе» переезжает на карточку списка.

## Принятые решения (от пользователя, не пересматриваются)
- Учитель проходит задание так же, как ученик: оценка в конце, без пометок «пробное».
- shareToken в публичные ответы не попадает (ADR-0002). Сервер на каждом запросе находит shareToken по публичному номеру среди опубликованных заданий и вызывает существующие use-cases игры без изменений.
- `/api/play` и его тесты не меняются.
- Лимитеры общие с `/api/play`: один бюджет на IP.
- `GET /api/library/:number` (getLibraryQuiz) удаляется вместе со всем, что нужно только ему.
- Тесты `widgets/library-quiz` удаляются, сломанные тесты обновляются. Запуск тестов — только по сигналу пользователя, интеграционные (db-test) — по одному.

## Что найдено при исследовании (важно для плана)
1. **Номер ADR — 0019, а не 0017.** Номер 0017 зарезервирован в ADR-0016 (строка 59) и в `docs/superpowers/*/2026-11-19-truefalse*.md` под «реестр типов».
2. **«Тот же 404, что у play» сам не получится.** `playQuizNotFound()` — `AppError(404, 'Quiz not found')`, а `libraryNotFound()` — `AppError(404, 'Not found')`: тела ответов различаются. Фича library не может импортировать `play/application/playErrors`. Нужен свой конструктор ошибки с тем же статусом и текстом и тест на побайтное равенство тел.
3. **Публичность проверяет только новый резолвер.** `findByShareToken` в quizRepository, matchingRepository и trueFalseRepository фильтрует только `deletedAt: null`, без is_public и модерации. Поэтому проверка «снято / скрыто / удалено → 404» нужна на **всех шести** маршрутах, а не только на GET.
4. **Лимитеры play создаются внутри вызова** `makePlayRouter({... limiters: { get: playLimiter(...) } })`. Их нужно вынести в одну константу.
5. **Исправления slug в адресе сейчас нет.** Ни `LibraryQuizPage`, ни `LibraryQuiz`, ни `useLibraryQuiz` не делают `replace`. Канонический адрес — это **новое** поведение (см. шаг 8.4).
6. **`noindex` ставят сами виджеты игр.** `QuizPlay.vue:47`, `MatchingPlay.vue:47`, `TrueFalsePlay.vue:85` вызывают `useSeoMeta({ robots: 'noindex, nofollow' })`. Значит, адрес игры из библиотеки будет noindex, что бы ни делала страница.
7. **Ответы игры не содержат shareToken по схеме.** `play*ResponseSchema` в `packages/shared/schemas` поля shareToken не имеют; shareToken есть только в ответах кабинета (`quizResponses.ts`, `matching.ts`, `trueFalse.ts`). Это нужно закрепить тестом (шаг 4).
8. Сущности на сайте друг друга не импортируют: `matchingPlayApi` и `trueFalsePlayApi` зависят только от `@/shared`. Поэтому общий тип адреса игры живёт в `src/shared/lib`.

## Файлы для изменения
**Документация**
- `docs/adr/README.md` — строка 0019 в оглавлении
- `docs/architecture.md` — маршруты `/api/library/play/*`; удалить `GET /api/library/:number`; страница `/library/quiz/<slug>` = игра; «Взять себе» на карточке

**Сервер (`apps/api`)**
- `src/features/library/types.ts` — в `LibraryRepository` добавить `findPlayableShareToken`; убрать `findByNumber`, `LibraryQuizRow`, `LibraryShuffle`
- `src/features/library/infrastructure/libraryRepository.ts` — новый метод; удалить `PUBLIC_SELECT`, `PublicRow`, `toLibraryQuizRow`, `findByNumber`
- `src/features/library/application/toLibrarySummary.ts` — удалить `parseQuestions`, `parsePairs`, `parseTrueFalseItems`, оставить `toLibrarySummary`
- `src/features/library/application/libraryErrors.ts` — добавить `libraryPlayNotFound()`
- `src/features/library/presentation/libraryRoutes.ts` — удалить `GET /:number`, `getLibraryQuiz` и `limiters.quiz` из deps; `parseNumber` вынести в общий хелпер
- `src/features/library/limits.ts` — удалить `QUIZ_PER_MINUTE` и `quiz`
- `src/features/library/index.ts` — убрать `makeGetLibraryQuiz` и `LibraryQuizRow`; добавить новые экспорты
- `src/app.ts` — вынести use-cases и лимитеры play в константы, подключить новый роутер, убрать getLibraryQuiz

**Shared (`packages/shared`)**
- `schemas/library.ts` — удалить `libraryQuizCardSchema`, `libraryMatchingCardSchema`, `libraryTrueFalseCardSchema`, `libraryQuizResponseSchema`, тип `LibraryQuizResponse`, `LIBRARY_PREVIEW_QUESTIONS` (и его комментарий). `imageUrlSchema` оставить: его использует превью. Комментарий у `RESERVED_GROUP_SLUGS` поправить: «адрес задания»
- `schemas/index.ts` — убрать эти экспорты
- Потребители shared: api (library, тесты) и web (entities/library). Других нет (проверено grep)

**Сайт (`apps/web`)**
- `src/shared/lib/index.ts` (+ новый файл) — `PlaySource`
- `src/entities/quiz/playApi.ts`, `src/entities/matching/matchingPlayApi.ts`, `src/entities/true-false/trueFalsePlayApi.ts` — принимают `PlaySource`
- `src/widgets/quiz-play/store.ts`, `QuizPlay.vue`; `src/widgets/matching-play/store.ts`, `MatchingPlay.vue`; `src/widgets/true-false-play/store.ts`, `TrueFalsePlay.vue` — `token` → `source`
- `src/pages/PlayPage.vue` — проп адреса, ветка библиотеки (без смены языка, 404, канонический slug)
- `app/pages/play/[token].vue` — передаёт share-адрес
- `app/pages/library/quiz/[slug].vue` — показывает `PlayPage` с library-адресом, `layout: 'play'`
- `src/widgets/play-panel/PlayPanel.vue` — `token` → `source`; ссылка библиотеки для library
- `src/widgets/library-browser/LibraryBrowser.vue` — кнопка «Взять себе» на карточке, диалог входа, restoreSession
- `src/features/take-library-quiz/TakeLibraryQuizButton.vue` — компактный вариант
- `src/entities/library/libraryApi.ts`, `types.ts`, `index.ts` — удалить `get`, `LibraryQuizResponse`, `LibraryQuizDetails`, `LibraryQuizCard`
- `src/shared/i18n/locales/{ru,en,de,fr}.ts` — удалить неиспользуемые ключи (шаг 10)

## Файлы для создания
- `docs/adr/0019-library-opens-game.md` — ADR
- `apps/api/src/features/library/application/findLibraryShareToken.ts` — use-case «номер → shareToken»
- `apps/api/src/features/library/presentation/libraryPlayRoutes.ts` — роутер `/api/library/play`
- `apps/api/src/features/library/presentation/parseLibraryNumber.ts` — общий разбор номера для двух роутеров (или функция в libraryRoutes с экспортом — на выбор разработчика)
- `apps/api/tests/libraryPlayRoutes.test.ts` — unit-тесты роутера на фейках
- `apps/api/tests/integration/libraryPlayRoutes.int.test.ts` — интеграция на db-test
- `apps/web/src/shared/lib/playSource.ts` (+ `playSource.test.ts`) — тип и построитель пути API
- `apps/web/src/widgets/library-browser/components/LibraryLoginDialog.vue` — перенос из library-quiz (вместе с `libraryLoginDialog.nuxt.test.ts`)
- `apps/web/src/pages/libraryPlayPage.nuxt.test.ts` — PlayPage с library-адресом
- `apps/web/src/widgets/library-browser/libraryBrowserTake.nuxt.test.ts` — кнопка на карточке

## Файлы для удаления (разрешено пользователем)
- `apps/api/src/features/library/application/getLibraryQuiz.ts`
- `apps/web/src/widgets/library-quiz/` целиком: `LibraryQuiz.vue`, `useLibraryQuiz.ts`, `formatLibraryDate.ts`, `index.ts`, `components/{LibraryQuizQuestion,LibraryMatchingPreview,LibraryTrueFalsePreview}.vue`, тесты `libraryQuiz`, `libraryQuizTake`, `libraryMatching`, `libraryMatchingEdge`, `libraryTrueFalse`, `useLibraryQuiz`, `formatLibraryDate.test.ts`. `LibraryLoginDialog.vue` и его тест **переносятся**, а не удаляются
- `apps/web/src/pages/LibraryQuizPage.vue`
- `apps/web/src/pages/libraryQuizPage.nuxt.test.ts` — заменяется `libraryPlayPage.nuxt.test.ts`

## Шаги

### 1. ADR-0019 [small]
`docs/adr/0019-library-opens-game.md`, статус «Предложено», по шаблону README. Строка в оглавлении.
- **Контекст:** страница-карточка со списком вопросов лишняя. Учитель хочет пройти задание, как в Wordwall.
- **Решение:**
  - `/library/quiz/<номер>-<slug>` показывает игру в проигрывателе интро (ADR-0014). Учитель проходит её как ученик.
  - Маршруты `/api/library/play/<номер>` (GET, `/check`, `/finish`, `/matching/finish`, `/true-false/check`, `/true-false/finish`) на каждом запросе находят shareToken среди опубликованных заданий. shareToken клиенту не отдаётся. Лимиты общие с `/api/play`.
  - `GET /api/library/:number` удалён.
  - «Взять себе» — на карточке списка.
  - Язык игры из библиотеки не переключается по браузеру.
- **Последствия:**
  - **Главное.** Правильные ответы заданий из библиотеки (и с оценкой тоже) теперь может получить любой аноним. Для этого нужен только публичный последовательный номер, без shareToken и без аккаунта. Ответы приходят через `check` и review в `finish` при `showAnswers` либо подбираются через `finish` (риск подбора принят для `/play`, см. memory quiz-step1). Раньше это требовало секретного shareToken или аккаунта учителя («Взять себе»).
  - Бюджет лимитов на IP общий для обеих игр.
  - Адрес игры пока noindex (ADR-0011).
- **Связи:**
  - уточняет **ADR-0002**: фраза «публичный ответ библиотеки не содержит правильных ответов» больше не верна для маршрутов игры, а shareToken по-прежнему не отдаётся;
  - уточняет **ADR-0013**: раздел о карточке библиотеки (`LIBRARY_PREVIEW_QUESTIONS`, карточка сопоставления) больше не действует;
  - уточняет **ADR-0005**: меняется только место кнопки;
  - опирается на **ADR-0014**;
  - ADR-0007 не меняется: там нет страницы задания.
  - Ни один принятый ADR не заменяется целиком. Статусы не меняем (открытый вопрос 1).
- **Отвергнутые варианты:** отдавать shareToken в ответе библиотеки (нарушает ADR-0002); редирект на `/play/<token>` (раскрывает токен); оставить карточку и добавить кнопку «Играть» (лишний шаг, решение пользователя).

### 2. Сервер: репозиторий и use-case [small]
- `LibraryRepository.findPlayableShareToken(number): Promise<string | null>` в `libraryRepository.ts`: `prisma.quiz.findFirst({ where: { ...PUBLIC_WHERE, publicNumber: number }, select: { shareToken: true } })`. То же условие `PUBLIC_WHERE`, что у списка и «Взять себе». Комментарий: «shareToken — только для вызова игры на сервере, в ответы не попадает».
- `application/findLibraryShareToken.ts`: `makeFindLibraryShareToken({ library })` → `(number) => Promise<string>`, при `null` бросает `libraryPlayNotFound()`. Одна операция — один файл, правило соблюдено.
- `libraryErrors.ts`: `libraryPlayNotFound()` = `new AppError(404, 'Quiz not found')`, с комментарием «тело совпадает с playQuizNotFound: адрес игры из библиотеки неотличим от /play». Тест на равенство — шаг 4.
- Удалить `findByNumber`, `PUBLIC_SELECT`, `PublicRow`, `toLibraryQuizRow`, `LibraryQuizRow`, `LibraryShuffle`, `getLibraryQuiz.ts` и три функции `parse*` в `toLibrarySummary.ts`. `parseType` и `PUBLIC_WHERE` остаются (их использует `findForCopy`). Перед удалением проверить grep, что `toLibrarySummary` по-прежнему нужен `listLibraryQuizzes` (да).

### 3. Сервер: роутер `/api/library/play` и app.ts [medium]
**Где живёт.** В фиче `library`: `presentation/libraryPlayRoutes.ts`, `LIBRARY_PLAY_ROUTES_BASE_PATH = '/api/library/play'`, `makeLibraryPlayRouter(deps)`. Фича library **не** импортирует play: функции игры приходят через deps из app.ts. Их типы описаны через схемы shared (`PlayActivityResponse`, `PlayCheckInput` и т. д.), как в `PlayRouterDeps`.

`LibraryPlayRouterDeps`:
- `findShareToken: (number: number) => Promise<string>`
- `getPlayActivity`, `checkAnswer`, `finishQuiz`, `finishMatching`, `checkTrueFalse`, `finishTrueFalse` — та же сигнатура, что в `PlayRouterDeps` (первым аргументом shareToken)
- `clientIp`
- `limiters: { get; check; finish }`

Маршруты повторяют `playRoutes.ts` (те же пути, лимитеры и схемы тел). Порядок для POST: лимитер → `readJsonBody(схема)` → разбор номера → `findShareToken` → use-case игры. Так у невалидного тела и номера то же поведение, что у `/play` (400 раньше 404). Для GET: лимитер → номер → токен → `getPlayActivity`.

**Номер** проверяется до БД: `libraryNumberSchema.safeParse(raw)`; ошибка → `libraryPlayNotFound()`. Общий `parseLibraryNumber(raw, notFound)` используют оба роутера: в libraryRoutes с `libraryNotFound`, в play-роутере с `libraryPlayNotFound`. Сам маршрут склеивает два вызова («номер → токен → игра»). Это тонкая оркестрация в presentation, бизнес-правил в ней нет. Отдельный use-case-обёртка на шесть операций нарушил бы правило «один файл — одна операция».

**libraryRoutes.ts:** удалить `GET /:number`, `getLibraryQuiz` и `limiters.quiz` из deps, импорт `LibraryQuizResponse`. `POST /:number/take` остаётся: он использует `findForCopy` и от `getLibraryQuiz` не зависит (проверено).

**app.ts:**
- до `app.route(PLAY_ROUTES_BASE_PATH, …)` создать константы `playLimiters = { get, check, finish }` и `play = { getPlayActivity: makeGetPlayActivity(...), checkAnswer: …, … }`;
- передать **те же объекты** в `makePlayRouter` и в `makeLibraryPlayRouter` (вместе с `findShareToken: makeFindLibraryShareToken({ library })`; `library` создать раньше или переставить блок);
- `app.route(LIBRARY_PLAY_ROUTES_BASE_PATH, …)` зарегистрировать **до** `app.route(LIBRARY_ROUTES_BASE_PATH, …)`;
- из библиотечного роутера убрать `getLibraryQuiz` и `quiz: libraryLimiter(LIBRARY_LIMITS.quiz)`, из импортов — `makeGetLibraryQuiz`.
- Тело запроса: `/api/library/play/*` попадает в `defaultBodyLimit` (100 КБ), как и `/api/play`. `bodyLimitFor` не меняется.

**Логи:** как в playRoutes — тела и номера не логируются (комментарий в шапке файла).

### 4. Сервер: тесты [medium]
**Обновить (сломаются):**
- `tests/libraryUnknownType.test.ts` — удалить кейс «карточка» (getLibraryQuiz), оставить «Взять себе»
- `tests/takeLibraryMatching.test.ts` и `tests/takeLibraryTrueFalse.test.ts` — удалить describe `getLibraryQuiz: карточка …`
- `tests/integration/libraryMatching.int.test.ts`, `libraryTrueFalse.int.test.ts`, `activityTypeIsolation.int.test.ts` — проверки `GET /api/library/<номер>` и `libraryQuizResponseSchema` перевести на `GET /api/library/play/<номер>` с `playActivityResponseSchema` (там, где проверяется «не видно ответов», «скрытое → 404», изоляция типов) или удалить, если проверка была только про карточку
- `packages/shared/schemas/auth.test.ts` (~строка 653) — убрать `'libraryQuizResponseSchema'` из списка экспортов
- `packages/shared/schemas/library.test.ts` — удалить describe «адрес картинки в карточке» и «карточка библиотеки да/нет». Проверку `imageUrlSchema` (javascript:/data:) перенести на `libraryThumbnailSchema`, если там её ещё нет
- проверить `libraryList.int.test.ts` и `libraryTake.int.test.ts` (grep `LIBRARY_LIMITS.quiz` и `limiters.quiz`: в тестах не найдено, но фейки deps роутера могут их передавать)

**Добавить** `tests/libraryPlayRoutes.test.ts` (фейки, без БД):
- номер `abc`, `0`, `-1`, `2147483648`, `12.5` → 404 на всех шести маршрутах, `findShareToken` не вызывается
- (общий бюджет лимитов и равенство тел 404 проверяются только через `createApp` — в интеграционном тесте ниже: тест на фейках доказал бы лишь собственную сборку)

**Добавить** `tests/integration/libraryPlayRoutes.int.test.ts` (db-test, запуск по сигналу):
- для quiz, matching, truefalse: GET отдаёт игру; `/check` и `/finish` (свои пути у каждого типа) работают по номеру и дают тот же результат, что `/api/play/<token>`
- **снято с публикации** (`is_public=false`), **скрыто модерацией** (`moderation_hidden_at`), **удалено** (`deleted_at`), несуществующий номер → 404 на **каждом** из шести маршрутов. Публичность проверяет только резолвер (находка 3)
- **shareToken не уходит клиенту:** текст каждого ответа (get, check, finish, matching/finish, true-false/check, true-false/finish, а также 404 и 409) не содержит строку shareToken задания; заголовки ответа тоже
- **правильные ответы до проверки не уходят:** GET без `isCorrect`, `selectCount` с правильными, `answer`, связей пар; тот же набор ключей, что у `/api/play`
- копия «Взять себе» (`is_public=false`) по номеру не играется (у копии номер есть, но она не публичная)
- `GET /api/library/<номер>` теперь 404 (маршрут удалён)
- через `createApp`: тело 404 `GET /api/play/<невалидный>` **побайтно равно** телу `GET /api/library/play/<невалидный>` (настоящий `makeErrorHandler`)
- через `createApp`: исчерпать `PLAY_LIMITS.get` (120) на одном префиксе → 429 на другом (проверяет, что app.ts передал те же экземпляры)
- 409 при изменённом задании (version) работает через номер

### 5. Typecheck сервера и shared [small]
`npm run typecheck` (или аналог) в `apps/api` и `packages/shared`, затем grep: `getLibraryQuiz`, `LibraryQuizRow`, `libraryQuizResponseSchema`, `LIBRARY_PREVIEW_QUESTIONS`, `findByNumber`, `LIBRARY_LIMITS.quiz` — ноль совпадений вне `.claude` и `docs`. Сайт на этом этапе ещё ссылается на `libraryApi.get` — его typecheck после шага 9.

### 6. Сайт: `PlaySource` в shared [small]
`src/shared/lib/playSource.ts`:
- `type PlaySource = { kind: 'share'; token: string } | { kind: 'library'; number: number }`
- `playApiPath(source): string` → `/play/${encodeURIComponent(token)}` или `/library/play/${number}`
- `isPlaySourceValid(source): boolean` — `shareTokenSchema` или `libraryNumberSchema`

Экспорт через `src/shared/lib/index.ts` → `src/shared/index.ts`. Строку `token` двумя смыслами **не перегружаем**. Тест `playSource.test.ts`: оба пути и экранирование `../auth/me`.

### 7. Сайт: API игр и сторы [medium]
- `playApi.get/check/finish(source, …)`, `matchingPlayApi.finish(source, …)`, `trueFalsePlayApi.check/finish(source, …)`: путь — `${playApiPath(source)}/check` и т. д. Комментарии про «/api/play/*» обновить.
- Сторы `usePlayStore`, `useMatchingPlayStore`, `useTrueFalsePlayStore`: `token = ref('')` → `source = ref<PlaySource | null>(null)`; `start(newSource?: PlaySource, …)`; проверка `isPlaySourceValid` вместо `shareTokenSchema` (`null` → notFound). Логика прохождения не меняется. `store.ts` уже есть и нужен (состояние общее для подкомпонентов игры), новых сторов нет.
- `QuizPlay`, `MatchingPlay`, `TrueFalsePlay`: проп `token` → `source: PlaySource`. Найти и поправить прочих пользователей `store.token` (`MatchingResult.vue`, `PlayResult.vue`, `TrueFalseResult.vue` попали в grep — проверить, что именно они читают).
- **Механическая правка тестов** (разрешена): `entities/quiz/playApi.nuxt.test.ts`, `entities/matching/matchingPlayApi.nuxt.test.ts`, `entities/true-false/trueFalsePlayApi.nuxt.test.ts`, `widgets/quiz-play/{store,quizNavigation,quizPlayTimer,quizClockHold,quizEntranceClock,useQuizTimer}.nuxt.test.ts`, `widgets/quiz-play/components/{playEntrance,playFocus,playImages,playTimer}.nuxt.test.ts`, `widgets/matching-play/{store,matchingPlay,matchingPlayGaps,matchingClockHold,matchingEntrance}.nuxt.test.ts`, `widgets/true-false-play/{store,storeEdges,trueFalsePlay,trueFalseClockHold,trueFalseEntrance}.nuxt.test.ts`, `pages/{playPage,playPageDispatch,playPageIntro}.nuxt.test.ts`, `widgets/play-panel/playPanel.nuxt.test.ts`. `start(TOKEN)` → `start({ kind: 'share', token: TOKEN })`, `props: { token }` → `props: { source }`. Тесты обхода пути `'../auth/me'` и `..%2Fauth` оставить **дословно**, только обернуть в share-источник. Ожидаемые URL `/api/play/...` не меняются. В каждый API-тест добавить по кейсу library: `/api/library/play/12/...`.

### 8. Сайт: страница игры для библиотеки [medium]
**8.1 Пропы.** `PlayPage.vue` получает `address: { kind: 'share'; token: string } | { kind: 'library'; slug: string }` (тип в самом файле). Route-файлы передают литерал из параметра, без логики:
- `app/pages/play/[token].vue`: `<PlayPage :address="{ kind: 'share', token }" />`, meta без изменений
- `app/pages/library/quiz/[slug].vue`: `<PlayPage :address="{ kind: 'library', slug }" />`, `definePageMeta({ name: 'library-quiz', layout: 'play' })`. Layout `play` такой же, как у `/play` (шапка, подвал, фон-плата, без PreFooter); `preFooter: false` больше не нужен. Ключ страницы — см. 8.4.

PlayPage сам переводит `address` в `PlaySource`: для library — `parseQuizSlug(slug)` → `{ kind: 'library', number }` или `null`.

**8.2 Язык.** Для library `redirect()` из `usePlayLocaleRedirect` **не вызывается**: язык выбирает пользователь сайта. Сам composable не меняется (у него один потребитель — PlayPage, поведение `/play` прежнее). В комментарии у `onMounted` указать причину.

**8.3 Не найдено.** Мусорный slug → `showError(404)` без запроса к API (как у старой страницы). 404 от `playApi.get` для library → тоже `showError(404)`. Прочие сбои → `{ kind: 'quiz' }` без initial, QuizPlay показывает «повторить», как у `/play`. Выбор между страницей 404 и «не найдено» внутри проигрывателя — открытый вопрос 4; рекомендация — страница 404, как было. `pages/libraryQuizNotFound.nuxt.test.ts` остаётся, поправить в нём комментарий «тот же вызов, что делает PlayPage для библиотеки».

**8.4 Канонический адрес (новое поведение).** Рекомендация: **сделать**, потому что дешёво и ссылки из соцсетей и закладок со старым названием выглядят аккуратно.
- После успешного GET взять `title` из ответа. Если `localePath(libraryQuizPath(number, title))` ≠ `route.path`, то `navigateTo(path, { replace: true })` с сохранением `route.query` и `hash`.
- **Ловушка:** сейчас `[slug].vue` ставит `:key="slug"`, и replace пересоздаст страницу: второй GET, интро с нуля, мигание. Ключ страницы нужно строить **по номеру**, а не по slug: `definePageMeta({ key: (route) => … })` с номером из `parseQuizSlug` или маленьким хелпером в `@nataskium/shared/library`. Тогда при смене только slug страница не пересоздаётся, а при переходе на другое задание пересоздаётся. **`:key="slug"` из шаблона `[slug].vue` убрать** (иначе он всё равно пересоздаст страницу), а PlayPage не должен следить за `address` (`watch`): после replace меняется только slug.
- Проверить в браузере: смена языка переключателем после replace ведёт на правильный slug.
- Если ключ по номеру окажется хрупким (Nuxt i18n и page key), запасной вариант — отложить исправление slug до шага SEO (ADR-0011): сейчас его нет, и неверный slug всё равно открывает задание по номеру.

**8.5 noindex.** Виджеты игр сами ставят `robots: noindex` (находка 6), страница игры из библиотеки будет закрыта от поисковиков. Рекомендация — принять до шага SEO (ADR-0011) и ничего не менять (открытый вопрос 5).

**8.6 PlayPanel.** Проп `token` → `source: PlaySource`. «Скопировать ссылку»: share → `playUrl(token)` (как сейчас); library → `window.location.origin + localePath(libraryQuizPath(number, title))` (локализованный адрес библиотеки, язык не теряется). «Создать задание» и диалог входа не меняются. В `playPanel.nuxt.test.ts` добавить кейс library.

Проверить, что PlayPage, PlayPanel и QuizPlay в режиме library не показывают `play.previewNote` и пометки предпросмотра: `?preview=1` бывает только у `/play`.

### 9. Сайт: «Взять себе» на карточке библиотеки [medium]
**Где логика.** В `widgets/library-browser` (виджет → features: `take-library-quiz`, `auth`; → entities: `library`). Виджет в виджет не импортируется. `LibraryLoginDialog.vue` переезжает в `widgets/library-browser/components/` вместе с тестом: у него один потребитель. В `LibraryBrowser.vue`:
- `isSessionChecked`, `isLoginOpen` (локальные ref, `store.ts` **не нужен**: состояние одного компонента и не переживает навигацию)
- `onMounted`: `await restoreSession()` в try/finally → `isSessionChecked = true` (как в старом LibraryQuiz). `void loadGroups()` и `void reload()` не ждут сессию.
- `take(number)` → `authorizedRequest((token) => libraryApi.take(number, token))`
- `onTaken(quiz, quizId)` → `navigateTo(localePath(takenEditPath({ quizId, type: quiz.type })))`. Тип копии берётся из элемента списка (копия того же типа), а не из модульной переменной `taken`: две карточки не перепутаются.
- `loginTo = { path: localePath(AUTH_PATHS.login), query: { next: route.fullPath } }` — после входа учитель возвращается в тот же раздел или поиск.
- Один диалог на весь список.

**Кнопка на карточке.** `<TakeLibraryQuizButton compact … />` в отдельной обёртке `.library-browser__actions` **после** блока с ссылкой. Обёртка с `position: relative` без z-index: позиционированные элементы с `z-index: auto` рисуются в порядке дерева, и обёртка окажется над `::after` ссылки. Новый токен `--z-*` не нужен. Если в браузере это не сработает (например, из-за `card-surface`), добавить `--z-card-action` в блок `--z-*` `global.scss` по правилам каскада. Вставлять его перед `--z-pre-footer` нельзя: это сдвигает весь каскад. Комментарий в стиле: «над растянутой ссылкой карточки».

**Компактный вариант `TakeLibraryQuizButton`.** Проп `compact?: boolean` (по умолчанию false, существующие тесты не меняются).
- compact рисует свою кнопку, не `AppButton` (тот шириной 280/320px, 52/60px, со стрелкой): ширина 100% карточки, min-height 44px (зона касания), шрифт 14–15px, стиль «мягкой» кнопки бренда, `rgb(var(--rgb-…) / a)`.
- Ярлыки: при `taking` — «Копируем…»; при `taken` в compact — короткий новый ключ `library.take.takenShort` («Готово»), полный текст уходит в sr-only статус.
- Ошибки и ссылки (лимит → «Мои задания», notFound → «К разделам») показываются под кнопкой в карточке, шрифт 13px, `overflow-wrap: anywhere`. Карточка растёт, зато результат виден у действия (memory «UI clarity first»). Альтернатива — открытый вопрос 6.
- Фокус после ошибки возвращается на кнопку (`RETRYABLE_STATUSES`): в compact у кнопки должен быть тот же `ref`.
- Плитки: 2 колонки на телефоне (~170px), 3 на tablet, 4 на desktop — кнопка на всю ширину карточки снизу. «Списком»: кнопка в колонке info под метаданными, `align-self: flex-start`; на `@include tablet` можно справа. Только миксины `tablet`/`desktop`, мобильная вёрстка первой.
- Кнопка доступна гостю (откроет окно входа), как раньше.

**Ссылка карточки** не меняется (`libraryQuizPath`) — теперь она ведёт в игру.

**entities/library:** удалить `libraryApi.get`, `libraryQuizResponseSchema` из импорта, типы `LibraryQuizResponse`, `LibraryQuizDetails`, `LibraryQuizCard` из `types.ts` и `index.ts`. `libraryApi.nuxt.test.ts`: удалить describe `libraryApi.get`.

**Удаления (шаг можно сделать отдельным мини-коммитом по сигналу):** `widgets/library-quiz/` целиком (кроме переносимого диалога), `pages/LibraryQuizPage.vue`, `pages/libraryQuizPage.nuxt.test.ts`.

### 10. i18n [small]
Удалить во **всех четырёх** `src/shared/i18n/locales/{ru,en,de,fr}.ts`:
- `library.quiz.*`: `backToGroup`, `addedOn`, `previewTitle`, `questionNumber`, `previewNote`, `noQuestions` (весь блок `quiz`)
- `library.matching.*`: `previewTitle`, `definitionsTitle`, `termsTitle`, `termsNote` (весь блок)
- `library.trueFalse.previewTitle` (весь блок `trueFalse`)

Добавить `library.take.takenShort` (ru «Готово», en «Done», de «Fertig», fr «C’est fait»), если принят короткий ярлык.

**Оставить:** `library.take.*` целиком, включая `login.*` (диалог), `toLibrary`, `toMyActivities` и `errors.*` (кнопка), а также `library.loading`, `loadError`, `retry`, `graded`, `notGraded`, `questions`, `statements`, `title` (браузер и страницы). `play.imageFailed` используется игрой.

Перед удалением grep каждого ключа по `apps/web/src` (в том числе шаблонные `t(\`library.${…}\`)`). После правки локалей перезапустить контейнер web (memory i18n-dev-no-hmr).

### 11. Тесты сайта (новые) [medium]
- `pages/libraryPlayPage.nuxt.test.ts`:
  - `{ kind:'library', slug:'12-stolitsy' }` вызывает `playApi.get({kind:'library', number:12})`; запрос идёт на `/api/library/play/12`
  - мусорный slug (`abc`, `0`, `012-x`, `12abc`) → `showError(404)` без запроса
  - 404 API → `showError(404)`; 500 → «повторить» в проигрывателе
  - `navigator.languages = ['en']` на ru-адресе → **нет** `navigateTo` (язык не переключается)
  - для каждого из трёх типов рисуется своя игра
  - канонический slug: `12-old` → `replace` на `/library/quiz/12-<slug из title>`, страница не пересоздаётся (один GET)
  - нет `previewNote`
- `widgets/library-browser/libraryBrowserTake.nuxt.test.ts`:
  - на каждой карточке есть кнопка «Взять себе»
  - клик гостя открывает диалог, `next` — текущий адрес
  - у вошедшего: POST `take(number)`, переход в редактор по `quiz.type` (quiz, matching, truefalse)
  - два быстрых клика дают один POST
  - 409 показывает ошибку в карточке и ссылку
  - клик по кнопке **не** переходит по ссылке карточки (событие не всплывает в навигацию)
  - пока сессия не проверена, кнопка выключена
- `takeLibraryQuizButton.nuxt.test.ts` — дополнить кейсами `compact` (ярлык, ошибка, фокус). Существующие кейсы не трогать.
- `playPanel.nuxt.test.ts` — копирование ссылки library (`/en/library/quiz/12-…` на en).
- `tests/e2e/library.spec.ts` — переписать (разрешено как «сломавшиеся»):
  - клик по плитке открывает игру (`.intro-player`, «Начать»), запрос идёт на `/api/library/play/12`, в ответе-моке нет shareToken
  - 404 показывает страницу 404
  - «Взять себе» на карточке: окно входа, Esc, два клика — один POST, 409 и 503
  - нет горизонтальной прокрутки на 360px с кнопкой и диалогом

### 12. Typecheck и lint сайта [small]
`typecheck` и `eslint` в `apps/web` (`no-restricted-imports`: только через `index.ts`), затем grep: `libraryApi.get`, `LibraryQuizDetails`, `LibraryQuizCard`, `library-quiz`, `LibraryQuizPage`, `useLibraryQuiz`, `formatLibraryDate` — ноль вне `.claude` и `docs`. `npm audit` — новых зависимостей нет.

### 13. Проверка в браузере [medium]
Телефон 360, tablet, desktop:
- раздел → плитка → игра; для каждого из трёх типов пройти задание до оценки (учитель вошёл и гость)
- «Скопировать ссылку» даёт адрес библиотеки на текущем языке
- кнопка «Взять себе» на плитке и в виде «Списком»: не перекрывается ссылкой, Tab-фокус виден, ошибка и лимит выглядят аккуратно в узкой плитке
- канонический slug и смена языка после него
- снятое задание → 404
- В Network ни в одном ответе нет shareToken.
- Анимации Ната не меняются.

## Риски и граничные случаи
- **Правильные ответы библиотеки становятся доступны анониму по публичному номеру** (находка/ADR, открытый вопрос 2). Касается и заданий с оценкой (контрольных). Раньше нужен был секретный shareToken или аккаунт.
- **Публичность проверяется одним резолвером.** Любой новый маршрут игры в библиотеке без `findShareToken` обойдёт is_public и модерацию. Тест на все шесть маршрутов обязателен.
- **Гонка «номер → токен → игра»:** задание могут снять или удалить между двумя запросами в БД. Use-case игры сам отфильтрует удалённое (`deletedAt`), снятое с публикации проскочит в одном запросе. Принимаем (окно в миллисекунды, тот же контент и так был доступен мгновением раньше).
- **Тип по номеру ≠ тип маршрута** (например `/check` викторины на номер сопоставления): use-case игры вернёт 404 'Quiz not found' — то же тело, что у невалидного номера, раз `libraryPlayNotFound` совпадает с `playQuizNotFound`. Тип и так публичен в списке.
- **Общий бюджет лимитов:** класс за NAT, который играет в задание из библиотеки и одновременно по ссылке `/play`, расходует общий лимит (120 GET и 600 check в минуту). Так задумано.
- **Rate limiter в памяти** — по-прежнему одна реплика api.
- **Изменение shared** (`schemas/library.ts`, `schemas/index.ts`) затрагивает api и web; потребители перечислены в шагах 4 и 9.
- **Breaking-изменения публичных `index.ts`:** `entities/library` (минус `get` и 3 типа), `features/library` в api (минус `makeGetLibraryQuiz` и `LibraryQuizRow`), `widgets/library-quiz` (удаляется), пропы `QuizPlay`, `MatchingPlay`, `TrueFalsePlay`, `PlayPanel`, `PlayPage` (token → source/address). Предложить git checkpoint перед шагом 7 (затрагивает 3+ файла) — коммит только по согласию.
- **Prisma-миграций нет:** `public_number`, `share_token` и индексы уже есть. Проверить, что `publicNumber` уникален (`findFirst` по нему уже используется в `findForCopy`).
- **Персональных данных нет:** ничего о прохождении не сохраняется, ответы и номера не логируются.
- **Ключ страницы по номеру** (8.4) может конфликтовать с i18n-маршрутами Nuxt: проверить в браузере, есть запасной вариант.
- **Плитка 170px:** длинные тексты ошибок «Взять себе» раздуют плитку и сетку по высоте.
- `definePageMeta` у `[slug].vue` меняется с default на play layout: на странице не будет PreFooter и `initPcbGlow` (так же, как на `/play`).

## Открытые вопросы
1. **Статусы ADR и нумерация.** ADR-0019 «уточняет» 0002, 0005, 0013 и опирается на 0014; ни один не «Заменено». Устраивает? README требует «без пропусков», а 0017 уже пропущен (зарезервирован в ADR-0016 за реестр типов) — оставить 0019?
2. **Ответы анониму.** Подтвердить, что задания с оценкой (контрольные) из библиотеки можно проходить без shareToken, с `check`/review при `showAnswers` и подбором через `finish`. Варианты: (а) принять как есть — рекомендация, раз архитектура выбрана; (б) в библиотечной игре всегда скрывать правильные ответы (`showAnswers=false`) — для этого придётся менять use-cases игры или фильтровать ответ в роутере, что противоречит «use-cases без изменений».
3. **Канонический slug** (8.4): делать сейчас с ключом страницы по номеру или отложить до SEO?
4. **Невалидный, неопубликованный или удалённый номер:** страница 404 сайта (как у старой карточки, рекомендация) или «Задание не найдено» внутри проигрывателя (как у `/play`)?
5. **noindex** на игре из библиотеки (его ставят виджеты): принять до шага SEO (рекомендация) или уже сейчас перенести `robots` из виджетов в PlayPage?
6. **Ошибки «Взять себе» в узкой плитке:** текст под кнопкой в карточке (рекомендация) или одно общее сообщение над списком?
7. **Короткий ярлык «Готово»** для compact (новый ключ i18n) или оставить «Готово! Открываем вашу копию…»?
8. **Возврат к разделу из игры:** у старой карточки была ссылка «← К разделу». В проигрывателе её нет, есть только «назад» браузера и шапка. Добавить ссылку в PlayPanel для library или не нужно?


## Решения пользователя по открытым вопросам (2026-11-24) — ОБЯЗАТЕЛЬНЫ
1. Ответы доступны анониму — вариант А: принять, записать в последствия ADR-0019. Use-cases игры не менять.
2. Канонический slug — делать (шаг 8.4), с ключом страницы по номеру.
3. Неверный номер / мусорный slug / 404 API для библиотеки — «не найдено» ВНУТРИ проигрывателя, как у /play (не showError(404)). Мусорный slug — без запроса к API. Тест libraryQuizNotFound.nuxt.test.ts привести к этому поведению.
4. Ошибки «Взять себе» — под кнопкой в карточке.
5. Ссылки «← К разделу» в игре из библиотеки нет.
6. Короткий ярлык library.take.takenShort — да.
7. noindex — оставить как есть (виджеты игр).
8. ADR-0019 — статус «Принято», номер 0019, статусы других ADR не меняем.
9. Тесты: разрешено удалить тесты widgets/library-quiz и libraryQuizPage, обновить сломанные, добавить новые. ЗАПУСКАТЬ тесты нельзя без сигнала пользователя — только typecheck и eslint.
10. git commit / git add не делать.
