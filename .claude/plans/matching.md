# План: тип задания «Сопоставление» (matching)

Название типа в интерфейсе — «Сопоставление» (решение пользователя).

## Цель
Добавить второй тип задания — сопоставление пар «слово ↔ определение» (только текст): учитель создаёт и публикует в библиотеку, ученик проходит по общей ссылке `/play/<shareToken>` перетаскиванием или тапами и получает процент и оценку; результаты не сохраняются.

Статус: план, кода нет. Ничего не коммитим; `git add` делает пользователь.

## Что выяснено в коде (опора для решений)

- **Одна таблица `quizzes`** держит всё «пер-заданное»: `share_token` (unique, 128 бит), `public_number` (SERIAL — адрес `/library/quiz/<n>`), `group_slug` (FK на группы), `is_public`/`moderation_hidden_at`, `deleted_at` (soft delete + purge 30 дней), `timer_mode`/`time_limit_seconds`, `grading_scale`, `show_answers`, `questions jsonb`. FK на учителя — `ON DELETE CASCADE` (GDPR). Список библиотеки — сырой SQL с `jsonb_array_length(questions)`, пагинация и сортировка по `created_at`.
- Лимит 100 — `countByTeacher` по всем неудалённым строкам таблицы + суточный лимитер создания 200 (`QUIZ_LIMITS.create`, ключ `teacherId`). Это лимит **«заданий»** (ADR-0005), а не «викторин» — он уже по сути общий для таблицы.
- Любая выборка из `quizzes` сегодня **парсит строку схемой викторины**: `toStoredQuiz` (quizRepository), `parseCopySource` (takeLibraryQuiz), `toLibraryQuizRow`/`listRowSchema` (libraryRepository). Строка другого типа даст 500. Поэтому добавление типа без фильтров по `type` опасно.
- Игра ученика: `GET /api/play/:token` → `{ quiz }` (`playQuizResponseSchema`), страница `/play/[token]` → `PlayPage` → `QuizPlay` безусловно. Store `usePlayStore` (Pinia, `id: 'play'`) обслуживает `PlayQuestion`, `PlayResult`, `PlayTimer`, `useQuizTimer`.
- Таймер (ADR 0012): `useQuizTimer` и `PlayTimer.vue` импортируют `usePlayStore` напрямую; `QuizSettings.vue` (группа, «показывать ответы», шкала, таймер) жёстко связан с `useQuizEditorStore`. `quiz-play/index.ts` экспортирует только `QuizPlay`. Виджеты не импортируют виджеты → переиспользование требует выноса вниз.
- Оценка: `summarizeQuiz(points, scale)` работает по списку баллов, `QUESTION_POINTS = 60` на пункт. Для сопоставления подходит **без изменений**: верная пара = 60, неверная/пустая = 0 → `percent = верные/все`, `partialCount = 0`.
- Языков в интерфейсе **четыре**: `SUPPORTED_LOCALES = en, ru, de, fr`; `de.ts`/`fr.ts`/`en.ts` типизированы как `typeof ru` — пропущенный ключ ломает typecheck. Задача говорит «ru/en», но план обязан охватить все четыре (или вопрос пользователю, см. ниже).
- `ActivityType` в вебе уже = `'quiz' | 'gaps' | 'pictures'`; плитки `gaps` и `pictures` — заглушки без реализации (`TeacherCreatePage.select` игнорирует всё, кроме `quiz`).
- PG 18.6 (`docker-compose.yml`): `ADD COLUMN … NOT NULL DEFAULT '<константа>'` — только метаданные, без перезаписи таблицы.
- **Несоответствие в задании:** библиотека — это ADR **0002** (автопубликация), **0004** (существующие и удалённые), **0005** (копии «Взять себе» не публикуются), а не 0011 (0011 — SEO в конце проекта). Копия из библиотеки создаётся с `isPublic = false`.
- Принятое решение (память `quiz-step1-decisions`, architecture.md): риск подбора ответов перепрохождениями принят, защиту заново не предлагаем. В плане фиксируем только, что у сопоставления подбор дешевле (см. риски) — как факт для ADR, без предложения защиты.
- `intro-player` к заданию не относится (не подключён к игре); не трогаем. Нат (`src/shared/nat/`) не меняется.

## Ключевые решения

### 1. Модель данных — единая таблица `quizzes` + колонка `type` (рекомендация)

| Критерий | A. Единая таблица + `type` (рекомендую) | B. Отдельная таблица `matchings` |
|---|---|---|
| `public_number` и URL `/library/quiz/<n>` | Работает «из коробки» | Нужна общая последовательность или двойной номер, UNION в выдаче |
| Список библиотеки, пагинация, сортировка | Тот же SQL + колонка `type` | UNION двух таблиц по `created_at`, перепаковка `OFFSET/LIMIT`, поиск `ILIKE` ×2 |
| Лимит 100 и 200/день | `countByTeacher` и общий лимитер — автоматически общие | Считать две таблицы; лимитер шарить вручную |
| `share_token` unique и поиск в play | Один индекс, один запрос; токены гарантированно не пересекаются | Уникальность только внутри таблицы; поиск в двух таблицах |
| Soft delete, purge 30 дней, каскад при удалении аккаунта (GDPR), FK группы | Уже работают | Дублировать purge, каскад, группу, индексы |
| Картинки в парах (позже) | `quiz_images.quiz_id` уже указывает на `quizzes` | Новый FK/таблица |
| Риск для викторин | Нужен `type`-фильтр во всех существующих запросах (список ниже) — ловится тестами | Нулевой по данным, но дублируется ~10 файлов инфраструктуры |

Следующие типы («пропуски», «картинки») лягут так же — это обобщение без переименований и без переделки викторин.

**Где хранить пары:** в существующем `questions jsonb` (имя колонки не меняем: `RENAME COLUMN` затронул бы сырой SQL и Prisma-типы, откладываем). В схеме/ADR зафиксировать: «для `type = 'matching'` — массив пар `{ term, definition }`». `jsonb_array_length(questions)` и список библиотеки работают без правок. Альтернативы (новая колонка `pairs` и `questions` → nullable; переименование в `content`) — в «Открытых вопросах».

**CHECK-ограничения** (дублируют Zod-константы, как у таймера):
- `quizzes_type_check`: `type IN ('quiz', 'matching')`;
- `quizzes_matching_pairs_check`: `type <> 'matching' OR (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) BETWEEN 2 AND 10)`.

### 2. Протокол «перемешивание и проверка» (самое жёсткое ограничение)

Схема викторины (клиент перемешивает, на сервер уходит исходный индекс) **не переносится**: в сопоставлении индекс — это и есть правильная связь. Требование: ни `GET /api/play/:token`, ни публичная карточка библиотеки не должны давать связи слово↔определение — ни порядком в массиве, ни id, выведенным из индекса пары.

Сравнение вариантов (сервер без состояния; результаты не хранятся):

| Вариант | Как | Минусы |
|---|---|---|
| **a. Ответ по тексту слова + случайное перемешивание слов на сервере (рекомендую)** | `GET` отдаёт `definitions[]` в порядке учителя (индекс = номер определения) и `terms[]` — слова в **случайном порядке** (CSPRNG Fisher–Yates на каждый запрос, без id). Ученик в `finish` присылает для каждого определения `i` текст выбранного слова или `null`. Сервер: верно, если `answers[i] === pairs[i].term` | Нужны правила уникальности текста (см. ниже). Тексты в теле запроса (≤10×60 символов) |
| b. Непрозрачные id, сохранённые при сохранении | id генерируются при `save`, хранятся в jsonb рядом с парой | Меняет форму данных; id «слова» и «определения» нужно связать — тот же риск утечки при ошибке; усложняет копирование из библиотеки (перегенерация id) |
| c. HMAC-id от `shareToken+version+index` + перемешивание на клиенте | id = `HMAC(secret, token\|version\|i)` | Нужен секрет и сопровождение; ошибка в генерации = утечка; выигрыша перед (a) нет |
| d. Перестановка из HMAC-сида | порядок правых колонок воспроизводится по сиду | Сложнее, нужен тот же секрет; нужна стабильность между GET и finish ради ничего: ответ по тексту порядка не требует |

Почему (a): воспроизводимость порядка между GET и finish **не нужна** — ответ ссылается на текст, а не на позицию. Сервер не хранит перестановку, не нужны секреты, нет шансов «пробросить» индекс. Клиент определения **не перемешивает** (решение пользователя): номер определения = порядок учителя. Слова перемешивает только сервер, новое перемешивание — при каждом GET, в том числе при повторе.

Правила, которые делают (a) однозначным (проверяет Zod при сохранении, `superRefine`):
- Слова уникальны внутри задания; определения тоже. Сравнение — по нормализованному ключу (NFC, trim, схлопнутые пробелы, регистр не учитывается). Дубль → 400 с путём поля.
- Оба поля обязательны (пустая сторона недопустима: картинок пока нет).
- Лимиты: 2–10 пар; слово ≤ 60 символов, определение ≤ 200 (предложение, повторяет константы `OPTION_TEXT_MAX_LENGTH` и `QUESTION_TEXT_MAX_LENGTH`; значения подтвердить, см. вопросы). Те же `safeText`-проверки (управляющие и bidi-символы запрещены; контент публичен и виден детям).

Протокол ученика:
- `GET /api/play/:token` → `{ type: 'matching', matching: { title, showAnswers, version, timer, definitions: string[], terms: string[] } }`. Явная сборка полей в use-case (требование аудита №5), без `pairs`.
- `POST /api/play/:token/matching/finish` с телом `{ version, answers: (string | null)[] }`. `null` = «не отвечено» (истёк таймер, ADR 0012); длина строго = числу пар; слово, которого нет среди слов задания, → 400; одно слово дважды → 400 (иначе завысит процент, требование аудита №3). Устаревшая `version` → 409 (как у викторины).
- Ответ: `{ result: { percent, grade, correctCount, partialCount: 0, totalCount }, review? }`. `review` — массив `{ correct: boolean, term: string }` по индексу определения — **только если `showAnswers = true`** (иначе поля нет вовсе). Это и есть «переключатель показывать правильные ответы»: ответы раскрываются **после** проверки, одним запросом, `/check` для сопоставления не нужен.
- Отдельный путь `/matching/finish`, а не общий `/finish` с union-телом: у викторины пустой `[]` валиден и для union, неоднозначно; отдельный путь — явная валидация. Токен викторины на `/matching/finish` и наоборот → 404, как неизвестный токен. Тип у строки неизменен (ни один маршрут его не меняет).
- Лимитеры: те же `get`/`finish` из `PLAY_LIMITS` (общий бюджет на IP); новых лимитеров нет.

Публичная карточка библиотеки: тот же принцип — `definitions` в порядке, `terms` в случайном порядке, без `pairs`, в пределах первых `LIBRARY_PREVIEW_QUESTIONS` (5) пар (термины тех же пар, перемешанные — иначе членство слов раскрыло бы, какие пары скрыты).

### 3. Раздача одной ссылки двух типов
- `playQuizResponseSchema` получает поле `type: 'quiz'` (**аддитивно**: старые клиенты игнорируют лишнее). Новый `playMatchingResponseSchema` (`type: 'matching'`) и `playActivityResponseSchema = discriminatedUnion('type', …)`.
- API: `loadPlayable(sources, token)` пробует `quizzes.findByShareToken` (теперь с фильтром `type = 'quiz'`), затем `matchings.findByShareToken` (`type = 'matching'`); для токена матчинга — один лишний индексный запрос. Фича `play` не знает репозиториев (связывание в `app.ts`).
- Фронт: `PlayPage` (слой `pages`) становится диспетчером. Рекомендуемый вариант: страница один раз делает `playApi.get(token)` (общий для двух типов, в `entities/quiz`), по `type` рендерит `QuizPlay` или `MatchingPlay` и передаёт им уже полученные данные (`initial`). Чтобы не делать два запроса, **редирект по языку** (`pickPlayLocale` + `switchLocalePath` + `PREVIEW_QUERY`) переезжает из `QuizPlay.onMounted` в общий composable (нижний слой, например `shared/lib`), вызываемый до загрузки.
  - Запасной вариант с меньшим изменением викторины: лёгкий `GET /api/play/:token/type` + каждый виджет грузит себя сам; цена — второй запрос на открытие ссылки (бюджет `get` 120/мин/IP, класс за NAT) и две копии редиректа языка. Не рекомендую.
- Затронутые потребители shared-схем игры: `packages/shared/schemas/{quiz,quizResponses,index}.ts`; API — `getPlayQuiz`, `playRoutes`, `loadPlayableQuiz`, `play/types.ts`, `app.ts`; web — `entities/quiz/{playApi,types}.ts`, `widgets/quiz-play/store.ts` (`start(token, random, initial?)`), `QuizPlay.vue`, `pages/PlayPage.vue`; тесты — `playApi.nuxt.test.ts`, `store.nuxt.test.ts`, `play.test.ts`, `integration/playRoutes.int.test.ts`, `e2e/quizPlay.spec.ts`.

### 4. Общие части (таймер, настройки, итог) — вынос вниз
Виджет `matching-play` не может импортировать `quiz-play`, а `matching-editor` — `quiz-editor`. Выносим **без изменения поведения** отдельными шагами с зелёными тестами:
- `features/play-session` (название на согласование): `PlayTimer.vue`, `usePlayTimer(source)` (вместо `useQuizTimer`, источник — интерфейс из ref'ов: `timer`, `startedAt`, `elapsedSeconds`, `timedOut`, `isFinished`, `expire()`), `formatClock`, ключ provide/inject; при желании — `PlayResultSummary` (проценты/оценка/«верно X из Y»/секундомер) с props вместо store. Адаптер в `QuizPlay` собирает источник из `usePlayStore` через `storeToRefs`.
- `features/activity-settings`: форма настроек (группа, «показывать ответы», шкала + пороги, таймер) на props/emit вместо `useQuizEditorStore`; `GroupSelect` переезжает туда же. `QuizSettings.vue` в `quiz-editor` остаётся тонкой обёрткой (иначе меняются тесты редактора).
- Затронутые тесты: `useQuizTimer.nuxt.test.ts`, `playTimer.nuxt.test.ts`, `formatClock.test.ts`, `quizPlayTimer.nuxt.test.ts`, `quizEditor.nuxt.test.ts`. Тесты **переносятся вместе с кодом**, не удаляются и не переписываются по сути — по CRITICAL RULES требуется согласие пользователя на перенос.
- В рабочем дереве уже есть **незакоммиченные правки** `apps/web/src/widgets/quiz-play/store.ts` и `store.nuxt.test.ts`; рефакторинг таймера и `start(…, initial)` трогает тот же store → сначала предложить чекпоинт (пользователь делает `git add`/коммит сама).

### 5. Лимиты
- 100 заданий — **общий** на учителя (рекомендация): `countByTeacher` уже считает все типы, `createQuiz`, `createMatching` и `takeLibraryQuiz` проверяют одно число. Отдельный лимит на тип = 100 × число типов, а лимит защищает диск и потолок строк в purge. Новая константа `MAX_ACTIVITIES_PER_TEACHER = 100`; `MAX_QUIZZES_PER_TEACHER` остаётся алиасом, пока не вычистим потребителей (`createQuiz`, `takeLibraryQuiz`, `QuizEditor.vue`, `TakeLibraryQuizButton`, тесты). Тексты «лимит викторин» в i18n пересмотреть.
- Суточный лимитер создания и лимитеры чтения/записи кабинета — **те же экземпляры** (`quizLimiter.create/read/write`), передаваемые в оба роутера, чтобы квота считалась общей.
- Тело запроса: пути `/api/matchings…` попадают в 100 КБ по умолчанию (`bodyLimitFor`), 10 пар ≈ несколько КБ — `quizBodyLimit` не нужен.

### 6. Библиотека «Взять себе» (ADR 0002, 0004, 0005)
Публикация автоматическая при создании (как у викторин); копия — `isPublic = false`; без картинок копировать нечего: `takeLibraryQuiz` ветвится по `row.type`: для `matching` парсит `matchingInputSchema`, пропускает копирование картинок, вызывает `createMatching(teacherId, input, { isPublic: false })`. Ответ `libraryTakeResponseSchema` получает `type`, чтобы фронт открыл нужный редактор. URL карточки остаётся `/library/quiz/<n>-<slug>` (slug группы `quiz` зарезервирован; переименование — вместе с SEO по ADR 0011).

### 7. Перетаскивание и тап (фронт)
- Своя реализация на Pointer Events, **без новых зависимостей**. Библиотеки (`vuedraggable`/`sortablejs`/`dnd-kit`-аналоги) в плане не рекомендуются; если пользователь захочет — статус `npm audit`/advisory/дата релиза **не проверен** (у меня нет доступа к проверке), потребуется отдельная проверка до установки. HTML5 DnD на тач-экранах не работает — не подходит.
- **Перетаскивание — главный путь** (решение пользователя, дизайн v3 в `docs/design/matching/REPORT.md`): слова лежат в **лотке сверху** экрана, лоток `position: sticky` (прилипает под шапкой), одна строка плиток листается вбок; таймер и «Проверить» — в лотке. Слово тащат из лотка на карточку определения (целью считается вся карточка); на занятое — заменяет, старое возвращается в лоток; обратно в лоток — возвращает; мимо — остаётся на месте.
- **Тап — запасной путь и путь клавиатуры/скринридера:** слово — `button` (`aria-pressed` у выбранного), определение — `button` с подписью «Определение N: …; сопоставлено со словом «…» / не сопоставлено». Тап по слову → тап по определению ставит пару; повторный тап по занятому определению возвращает слово в пул; `Escape` снимает выбор; живая область `aria-live="polite"` объявляет «выбрано слово…», «слово X сопоставлено с определением N». После постановки фокус переходит на следующее пустое определение, после последнего — на «Проверить». Кнопка «Проверить» доступна, когда все пары расставлены (по аналогии с `selectCount` у викторины); при истечении таймера уходят `null` для пустых.
- **Риск мобильного drag vs прокрутка** (10 пар не помещаются на экран): плитки лотка — `touch-action: pan-x` (свайп вбок листает лоток, вверх или по диагонали — берёт слово), поставленная плитка узкая, остальная карточка прокручивает страницу; порог движения до начала drag, `pointercancel`, автопрокрутка у нижнего края экрана и у нижней границы лотка, пока слово в руке, `prefers-reduced-motion`. Drag и тап делаются в одном шаге 13 (бывший шаг 14 слит с ним).
- Состояние игры — Pinia `store.ts` в `matching-play` (разделяется между доской, итогом и таймером, как `play`); состояние редактора — `store.ts` в `matching-editor` (переживает навигацию «создание → /teacher/matching/<id>», `handoverId`, как у викторины). Локального состояния недостаточно: оба случая совпадают с критериями проекта для `store.ts`.

### 8. Безопасность (требования аудита run-1 и правила проекта)
- Валидация → 400 через `readJsonBody` + Zod (№1); тест, что `issues`/ввод не уходят в ответ при 500.
- Массивы и строки ограничены схемой; тело ≤100 КБ (№2).
- Проверка ответов только на сервере: длина = числу пар, слова только из набора задания, без повторов, пустое задание отсечено `min(2)` (№3).
- Явный `select` и явная сборка play-ответа без `pairs`/индексов правильных; для карточки библиотеки то же (№5). Тест «no-leak»: сериализованный ответ не содержит `pairs`/`correct`, `terms` — мультимножество слов задания, порядок задаётся инъектируемым `shuffle` (как `generateShareToken`).
- `shareToken` — тот же генератор 16 байт; вынести `randomShareToken` из `createQuiz.ts` в `shared/utils` (малый безопасный перенос), `deletedAt: null` во всех выборках (№6).
- Логи без текстов слов и ответов; маршрутный путь без токена (№7).
- Владелец в **каждом** use-case и репозиторном методе: `findOwned(id, teacherId, type)`; чужое, удалённое, несуществующее и невалидное `:id` — одинаковый 404, не 403. Создание при удалённом аккаунте → 401 (как `referenceMissingError`).
- Rate limit — in-memory, **одна реплика `api`**: новых счётчиков нет, только общие (№12).
- GDPR: новых таблиц и персональных данных нет; пары — контент учителя; каскад и purge работают через существующие FK/задачи (№13). Данные учеников не хранятся.
- Зависимости: новых **нет**.
- CSP/деплой (№15): новых ресурсов нет (картинок в парах нет).

## Миграция — ВЫСОКИЙ РИСК (необратима «по-настоящему», down-миграций у Prisma нет)

Одна аддитивная миграция `…_add_quiz_type`:
- `ALTER TABLE "quizzes" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'quiz'` (PG 18: без перезаписи таблицы);
- два CHECK выше (добавляются вручную в SQL, Prisma их не описывает);
- заголовок с ручным откатом, как в `create_library`: `DROP CONSTRAINT …; DROP COLUMN "type"; DELETE FROM "_prisma_migrations" …`.

Обязательно: добавить оба CHECK в `MANUAL_CHECKS` в `apps/api/tests/migrations.test.ts` и интеграционный тест ограничений (`constraints.int.test.ts`): 1 и 11 пар отклоняются, `type = 'poll'` отклоняется, `questions` не массив отклоняется.

**Порядок выката:** миграция → затем API и web вместе. **Откат кода после появления строк `matching` небезопасен:** старый код парсит любую строку схемой викторины (500 в кабинете, списке библиотеки, play). Откат = сначала `UPDATE quizzes SET deleted_at = now(), is_public = false WHERE type = 'matching'` (или удалить такие строки), затем откат кода. Записать в ADR и в заголовок миграции.

## Реестр существующих запросов, которым нужен `type` (чтобы не получить 500)

В `apps/api/src`:
1. `quizzes/infrastructure/quizRepository.ts`: `findOwned`, `updateOwned`, `softDeleteOwned`, `findByShareToken` → фильтр `type = 'quiz'`; `create` пишет `type: 'quiz'`. `listByTeacher` — **без фильтра**, добавить `type` в SELECT (кабинет показывает все типы); `countByTeacher`, `purgeDeletedBefore` — без фильтра (намеренно общие).
2. `quizzes/types.ts` (`QuizSummary` + `type`), `quizSummarySchema` (+ `type`, аддитивно).
3. `library/infrastructure/libraryRepository.ts`: сырой `list` (+ `type` в SELECT, без фильтра), `PUBLIC_SELECT`/`COPY_SELECT` (+ `type`), `toLibraryQuizRow`, `listRowSchema`.
4. `library/application`: `getLibraryQuiz` (ветвление по типу), `toLibrarySummary`/`listLibraryQuizzes` (+ `type`), `takeLibraryQuiz.parseCopySource` (ветвление) + `LibraryCreateCopy`.
5. `play/application`: `loadPlayableQuiz` (двухэтапный поиск), `getPlayQuiz` (+ `type: 'quiz'`), `finishQuiz`/`checkAnswer` — не меняются, но обязаны получать только `type = 'quiz'`.
6. Тестовые фейки `apps/api/tests/fakes/quizFakes.ts` — поле `type`.
Покрыть тестом: токен/id матчинга на `/api/quizzes/:id` и `/api/play/:token/finish` → 404; токен викторины на `/matching/finish` → 404; список кабинета и библиотеки содержит оба типа; purge удаляет оба.

## Files to Modify

Shared (`packages/shared`; потребители — `apps/api`, `apps/web`):
- `schemas/quiz.ts` — экспорт `safeText`/`requiredText`, `MAX_ACTIVITIES_PER_TEACHER`, алиас старой константы
- `schemas/quizResponses.ts` — `type` в summary и play-ответе викторины, union play-ответа
- `schemas/library.ts` — `type` в `libraryQuizSummarySchema`; `libraryQuizResponseSchema` → union по типу; `libraryTakeResponseSchema` + `type`
- `schemas/index.ts` — экспорты
- `routes/teacherPages.ts` — `matchingNew: '/teacher/matching/new'`, `matchingEdit: '/teacher/matching'`

API (`apps/api`):
- `prisma/schema.prisma` (поле `type` + комментарий о хранении пар), `app.ts` (wiring), `quizzes/infrastructure/quizRepository.ts`, `quizzes/types.ts`, `quizzes/application/createQuiz.ts` (вынос `randomShareToken`), `library/**` и `play/**` по реестру выше, `tests/migrations.test.ts`, `tests/fakes/quizFakes.ts`, существующие тесты play/library/quizzes (адаптация под `type`)

Web (`apps/web`):
- `src/entities/activity/{types,activityTypes,index}.ts` и `ActivityCard.vue` (подпись «Пары: N»), `src/entities/quiz/{playApi,types}.ts`, `src/entities/library/**`
- `src/pages/{PlayPage,TeacherCreatePage}.vue`
- `src/widgets/my-activities/{useMyActivities,ManageActivities}` (тип из API, маршрут правки и удаления по типу)
- `src/widgets/quiz-play/{store.ts,QuizPlay.vue,index.ts,components/PlayTimer.vue,PlayResult.vue}` (выносы + `initial`), `src/widgets/quiz-editor/components/QuizSettings.vue`
- `src/widgets/library-quiz/**`, `library-browser/**` (карточка и подпись типа), `features/take-library-quiz/**` (переход по `type`)
- `src/shared/i18n/locales/{ru,en,de,fr}.ts` (ru — источник типов)
- `docs/architecture.md`, `docs/adr/README.md`

## Files to Create

- `docs/adr/0013-matching-activity.md` — ADR (черновик ниже), статус «Предложено»
- `apps/api/prisma/migrations/<ts>_add_quiz_type/migration.sql`
- `packages/shared/schemas/matching.ts` (+ `matching.test.ts`): `matchingInputSchema`, `MIN/MAX_MATCHING_PAIRS`, лимиты длин, ключ уникальности, схемы ответов кабинета и play, `playMatchingFinishInputSchema`, `playMatchingFinishResponseSchema`; `ACTIVITY_KINDS`
- `apps/api/src/features/matchings/{application/{createMatching,getMatching,updateMatching,deleteMatching}.ts,infrastructure/matchingRepository.ts,presentation/matchingRoutes.ts,types.ts,index.ts}` — по одному use-case на файл, фабрики `make…`; `/api/matchings`: `POST /`, `GET|PATCH|DELETE /:id` (список — общий `GET /api/quizzes`)
- `apps/api/src/features/play/application/finishMatching.ts` (+ `matchingAnswerValidation.ts`), `shared/utils/shareToken.ts`
- `apps/web/src/entities/matching/{matchingApi.ts,playApi.ts,newMatching.ts,types.ts,index.ts}`
- `apps/web/src/features/play-session/**`, `apps/web/src/features/activity-settings/**`
- `apps/web/src/widgets/matching-editor/{MatchingEditor.vue,store.ts,components/PairRow.vue,index.ts,*.test.ts}`
- `apps/web/src/widgets/matching-play/{MatchingPlay.vue,store.ts,components/MatchingBoard.vue,MatchingResult.vue,useMatchingDrag.ts,index.ts,*.test.ts}`
- `apps/web/src/pages/MatchingEditorPage.vue`; `apps/web/app/pages/teacher/matching/new.vue`, `app/pages/teacher/matching/[id].vue` (тонкие, `layout: 'teacher'`, `middleware: 'teacher-auth'`)
- Тесты: `apps/api/tests/{matchings,playMatching,takeLibraryMatching}.test.ts`, интеграционные для CRUD, play и копирования; `apps/web/tests/e2e/matching.spec.ts`

## Steps (малые диффы; после каждого — зелёные typecheck/lint/тесты; коммиты — только по просьбе)

### 0. Чекпоинт и ответы на вопросы [small]
Предложить git checkpoint (в дереве незакоммиченные `quiz-play/store.ts`, `store.nuxt.test.ts`; затрагиваем 3+ файла и публичный API). Получить ответы на «Открытые вопросы» 1–6 до шага 3. *Критерий:* чистое дерево или осознанное решение; решения записаны.

### 1. ADR 0013 [small]
Создать `docs/adr/0013-matching-activity.md` со статусом «Предложено» и строку в `docs/adr/README.md`; после ответов пользователя — «Принято». Черновик:
- **Контекст:** второй тип задания; принятые правила (оценка по проценту, результаты не хранятся, библиотека по ADR 0002/0005).
- **Решение:** `quizzes.type` (`quiz|matching`), пары в `questions` jsonb; CHECK; общий лимит 100 и общий лимитер; `type`-фильтры в запросах; play: `type` в ответе, отдельный `POST /matching/finish`; слова на `GET` в случайном порядке без id, ответ по тексту, `null` = не отвечено, `review` только при `showAnswers`; уникальность слов и определений; оценка через `summarizeQuiz` (60/0); таймер ADR 0012 без изменений; копии из библиотеки — ADR 0005.
- **Последствия:** подбор ответов дешевле, чем у викторины (до ~n² запросов частичных ответов вместо перебора по вопросам; тот же принятый риск, лимит `finish` 120/мин/IP); откат кода после появления строк `matching` требует их скрытия; название колонки `questions` вводит в заблуждение; зависимости не добавлены.
- **Отвергнуто:** отдельная таблица; id пар/HMAC-перестановка; клиентское перемешивание обеих колонок; `/check` по парам; библиотека drag-n-drop.
*Критерий:* ADR по шаблону, ссылки на 0002, 0004, 0005, 0012.

### 2. Shared: схемы и константы [medium]
`schemas/matching.ts` + экспорт `safeText/requiredText` из `quiz.ts` (аддитивно); `type` в summary/play/library-схемах (аддитивно); `ACTIVITY_KINDS`; `MAX_ACTIVITIES_PER_TEACHER`. Unit-тесты: границы 2/10, уникальность (регистр, NFC, пробелы), пустые стороны, запрещённые символы, формы ответов, `answers` с `null`. Потребители перечислены выше. *Критерий:* `npm test -w packages/shared`, typecheck api и web зелёные; поведение викторин не изменилось.

### 3. База: схема Prisma и миграция [medium, ВЫСОКИЙ РИСК]
`schema.prisma`, миграция с двумя CHECK и ручным откатом, `MANUAL_CHECKS`, интеграционный тест ограничений (БД `db-test`, порт 5433). Применять на dev-БД только после бэкапа. *Критерий:* `migrate dev` и `migrate deploy` на пустой БД проходят; `migrations.test.ts` и `constraints.int.test.ts` зелёные; существующие строки получили `type = 'quiz'`.

### 4. API: `type`-фильтры в существующих запросах [medium]
*Из шага 2 (вариант B):* `type: activityKindSchema` в `quizSummarySchema` вместе с `type` в `listByTeacher` и фикстурах кабинета.
По реестру выше, без новой функциональности. Тесты на изоляцию типов (создать строку `matching` прямым SQL в интеграционном тесте, убедиться, что викторинные маршруты её не видят). *Критерий:* все существующие тесты quizzes/library/play зелёные; новые тесты изоляции зелёные.

### 5. API: фича `matchings` (CRUD) [large → 5a, 5b]
5a — репозиторий + use-cases (`createMatching` с лимитом и повтором при коллизии токена, `getMatching`, `updateMatching`, `deleteMatching`; владелец в каждом; `unknownGroup`, `quizLimitReached`), unit-тесты с фейками. 5b — `matchingRoutes` (Bearer, лимитеры read/write/create — общие экземпляры), wiring в `app.ts`, вынос `randomShareToken`, интеграционные тесты маршрутов (401/404/409/400, чужой учитель, удалённый, лимит 100 общий с викторинами). *Критерий:* создать, прочитать, изменить, удалить; чужая запись → 404; 101-е задание любого типа → 409.

### 6. API: игра [large → 6a, 6b]
*Из шага 2 (вариант B):* `type: z.literal('quiz')` в `playQuizResponseSchema` и `playActivityResponseSchema` (union с `playMatchingResponseSchema`) вместе с `getPlayQuiz`, web `playApi` и фикстурами quiz-play.
6a — `GET /api/play/:token` с `type`, `loadPlayable` с двумя источниками, сборка matching-ответа с инъектируемым `shuffle`, no-leak тест. 6b — `finishMatching` (версия, длина, неизвестное слово, повтор слова, `null`, `review` по `showAnswers`), маршрут `/matching/finish` под `finish`-лимитером; тесты процента/оценки (`summarizeQuiz`), 409, 400, 404 при неверном типе. *Критерий:* контрактные тесты; ответ GET не содержит связи слово↔определение.

### 7. API: библиотека [medium]
*Из шага 4:* убрать временный фильтр `AND type = 'quiz'` из `libraryRepository.list`.
*Из шага 2 (вариант B):* `type` в `libraryQuizSummarySchema` и `libraryTakeResponseSchema`; `libraryQuizResponseSchema` → `{ quiz: discriminatedUnion('type', [карточка викторины, карточка matching с definitions/terms]) }` вместе с `toLibrarySummary`/`getLibraryQuiz`/`takeLibraryQuiz` и сужением в `LibraryQuiz*.vue`.
`type` в списке и карточке (определения по порядку, слова перемешаны, ≤5 пар), `takeLibraryQuiz` для `matching` (без картинок, `isPublic: false`, общий лимит), `type` в ответе take. *Критерий:* тесты `takeLibraryMatching`, `libraryList.int` с обоими типами, копия не появляется в библиотеке.

### 8. Web: вынос таймера/итога в `features/play-session` [medium]
Без изменения поведения; перенос тестов вместе с кодом (с согласия). *Критерий:* `quizPlayTimer`, `playTimer`, `useQuizTimer`, `playFocus` зелёные без правки ожиданий.

### 9. Web: вынос настроек в `features/activity-settings` [medium]
`QuizSettings` → обёртка. *Критерий:* `quizEditor.nuxt.test.ts` зелёный без правки ожиданий.

### 10. Web: сущности, типы и список заданий [medium]
*Из шага 2 (вариант B):* web читает `type` из `quizSummarySchema` (поле добавлено в шаге 4) в `useMyActivities`; фикстуры `myActivities.nuxt.test.ts` получают `type`.
`entities/matching`, `ActivityType` (+ `matching`), `ACTIVITY_TYPES` (иконка и цвет — по решению `ui-designer`), порядок плиток, i18n-ключи `teacher.activityTypes.matching.*` и подпись «Пары: N» (плюрал по языкам), `createHint`, `TEACHER_PATHS`; `useMyActivities` берёт тип из API, `ManageActivities` правит и удаляет по типу; `TeacherCreatePage.select` ведёт на `matchingNew`. *Критерий:* `myActivities.nuxt.test.ts` зелёный; в списке видны оба типа.

### 11. Web: редактор `matching-editor` [large]
Страницы и тонкие route-файлы, store, строки пар (слово + определение), добавить/удалить пару (2–10), ошибки по путям `pairs.N.term`, настройки через `activity-settings`, «Сохранено», копирование ссылки, предупреждение о несохранённом, лимит 409. Верстка — `ui-designer`, только mobile ([[mobile-first-only]]). *Критерий:* создать, сохранить, открыть, изменить; дубли и пустые поля подсвечиваются; unit-тесты store.

### 12. Web: диспетчер игры [medium, затрагивает quiz-play]
`PlayPage` с единственным `GET`, редирект языка в общий composable, `initial` в `store.start`, рендер по `type`. *Критерий:* прохождение викторины и превью (`PREVIEW_QUERY`) не изменились (`store.nuxt.test.ts`, `quizPlay.spec.ts`); для токена матчинга открывается `MatchingPlay`.

### 13. Web: игра `matching-play` — перетаскивание, тап, клавиатура, итог [large]
Store, доска, лоток сверху (sticky), перетаскивание `useMatchingDrag` на Pointer Events (главный путь), тап-путь (запасной), клавиатура, живая область, итог (проценты, оценка, `review` при `showAnswers`), таймер через `play-session`, обработка 404/409/ошибок сети, повтор с новым перемешиванием слов. Верстка — `ui-designer`. *Критерий:* unit/component-тесты, в том числе на логику попадания в цель; drag и тап дают одинаковый результат; реальный телефон/эмуляция: прокрутка при 10 парах не ломается; ручная проверка клавиатурой и VoiceOver; e2e «создать → пройти → итог».

### 14. Слит с шагом 13
Перетаскивание — главный путь, поэтому делается вместе с игрой в шаге 13. Номер оставлен, чтобы не перенумеровывать шаги.

### 15. Web: библиотека для матчинга [medium]
Подпись типа в карточках, превью пар (две колонки, слова перемешаны), «Взять себе» → переход в нужный редактор по `type`. *Критерий:* `libraryQuiz*.nuxt.test.ts` зелёные; e2e библиотеки.

### 16. i18n ru/en/de/fr и документация [small–medium]
Все ключи в ru (источник типов), en, de («Sie»), fr («vous»); проверка `locales.test.ts` и plural-форм; перезапуск контейнера `web` после правки локалей (нет HMR, [[i18n-dev-no-hmr]]). Обновить `docs/architecture.md` (модель, эндпоинты, лимиты, play). *Критерий:* typecheck и тест локалей зелёные; в интерфейсе нет сырых ключей.

### 17. Итоговая проверка [small]
`npm audit` (новых зависимостей нет — статус не должен измениться), typecheck, lint, все unit/integration/e2e; `tester` затем `code-reviewer` (critical/high блокируют коммит); ADR → «Принято».

## Risks & Edge Cases
- **Миграция** — высокий риск; безопасный порядок выката и опасный откат кода описаны выше.
- **500 из-за неотфильтрованного запроса** — главный риск единой таблицы; закрывается реестром, тестами изоляции и шагом 4 до любой новой функциональности.
- **Утечка пар**: порядок слов и массивов, повторяемость перестановки, id, производные от индекса; публичная карточка и play — один и тот же принцип; no-leak тест.
- **Подбор ответов** (принятый риск): при `showAnswers = false` частичными ответами (`null` у остальных) можно проверять по паре; перебор ≤ n² запросов, лимит `finish` 120/мин/IP. Это тот же принятый риск; зафиксировать в ADR, защиту не добавляем.
- В режиме `showAnswers = true` `finish` с пустыми ответами раскрывает пары до прохождения — эквивалент допустимой возможности вызвать `check` без ответа у викторины.
- **Дубликаты текста**: слова и определения уникальны (нормализованный ключ), иначе ответ по тексту неоднозначен. Нормализация должна совпадать в Zod (сохранение) и в проверке ответов (точное сравнение сохранённых строк после тех же `safeText`).
- **Гонка лимита 100** — как у викторин (не атомарна, принято).
- **Учитель правит задание во время прохождения** → 409 по `version` (`updatedAt`), как у викторины.
- **Таймер**: клиентский, поведение по ADR 0012; пустые ответы = `null` = 0.
- **Drag vs прокрутка на телефоне**, автопрокрутка, длинные тексты (≤200 символов) на узких экранах — перенос слов и `overflow-wrap`.
- **Переименование колонки `questions`** — отложено, путаница названия задокументирована.
- **Рефакторинг `quiz-play`/`quiz-editor`** (шаги 8, 9, 12) задевает работающий код и тесты; выполнять отдельными диффами после чекпоинта.
- Заглушки `gaps` и `pictures` в выборе типа по-прежнему ничего не открывают — вне объёма, но пользователь увидит рядом рабочий тип.
- Rate limiter in-memory → одна реплика `api`; новых лимитеров нет.
- Нат (`src/shared/nat/`) не затрагивается.

## Open Questions (к пользователю; рекомендации в скобках)

1. **Модель данных:** единая таблица `quizzes` + `type` (рекомендую) или отдельная таблица `matchings`? Пары — в `questions jsonb` с оговоркой в ADR (рекомендую), в новую колонку `pairs` или с переименованием в `content` позже?
2. **Лимит 100:** общий на все типы заданий и общий суточный лимитер создания (рекомендую) или отдельный на каждый тип?
3. **Раскрытие ответов при `showAnswers = true`:** показывать правильные пары на итоговом экране после проверки (рекомендую, один запрос, `/check` нет) или ученик должен проверять каждую пару сразу?
4. **Формулировки и размеры:** универсальные подписи «Слово / Определение» (задание говорит «слово к определению») или нейтральные (подходит и для «страна — столица»)? Лимиты 60/200 символов и правило «слова и определения уникальны без учёта регистра» — подходят?
5. **Рефакторинг и тесты:** согласны ли на вынос таймера и настроек в `features/` и **перенос** существующих тестов вместе с кодом (CRITICAL RULES запрещают удалять и переписывать тесты без запроса)? Чекпоинт перед шагом 8 (в дереве незакоммиченные правки `quiz-play/store.ts`)?
6. **Языки:** интерфейс на четырёх языках (en, ru, de, fr, типы требуют все) — писать de/fr самому в стиле существующих («Sie», «vous») или оставить на перевод вручную?
7. **Откат:** принимаем ли правило «перед откатом кода скрыть строки `matching`»?
8. **Плитка типа:** цвет и иконка нового типа выбирает `ui-designer` (в палитре три цвета занято `quiz/gaps/pictures`) — ок? Что делать с мёртвыми плитками `gaps`/`pictures` — оставить?
9. **Библиотека:** URL карточки остаётся `/library/quiz/<n>` для обоих типов, превью — первые 5 пар (ок?).
10. **Перетаскивание без библиотеки** (своё на Pointer Events) — согласны? Если нужна библиотека — потребуется отдельная проверка `npm audit` и поддержки до установки.
