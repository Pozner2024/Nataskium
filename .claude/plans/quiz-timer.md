# Plan: Таймер задания

## Goal
Учитель выбирает для задания режим таймера (без таймера / секундомер / лимит времени на всё задание); ученик видит его в игре, по истечении лимита игра завершается сама, а результат считается по прежним правилам.

## 1. Резюме и допущения

Решено пользователем (не пересматриваем): три режима, лимит на всё задание, по умолчанию «без таймера», обход лимита на клиенте допустим (пишем в ADR), интро-проигрыватель не трогаем, результаты не сохраняются.

Решила я (помечено в шагах):
1. **Форма данных.** В Zod таймер — одно вложенное поле `timer` с discriminated union по `mode`:
   `{ mode: 'none' } | { mode: 'stopwatch' } | { mode: 'limit', seconds: number }`.
   Инвариант «секунды обязательны только в `limit`» выражен самой формой, без `superRefine`. Причина: `quizResponseSchema` делает `quizInputSchema.extend(...)`, а `.extend` на схеме с refinement в Zod 4 (по памяти) бросает ошибку (при реализации проверить на 4.6.7; дизайн от этого не зависит, union работает в любом случае). `timer` получает `.default({ mode: 'none' })`, как `group`: старые клиенты без поля сохраняются как «без таймера».
2. **В базе — две колонки**: `timer_mode TEXT NOT NULL DEFAULT 'none'` и `time_limit_seconds INT NULL`, плюс ручные CHECK (как у `grading_scale`), которые дублируют инвариант. Преобразование «колонки ↔ объект `timer`» — две маленькие чистые функции в `packages/shared/schemas/quiz.ts`; их используют quizzes-репозиторий и копирование из библиотеки, дублирования нет.
3. **Границы лимита:** `MIN_TIME_LIMIT_SECONDS = 60`, `MAX_TIME_LIMIT_SECONDS = 10800` (1–180 минут), значение по умолчанию при включении `DEFAULT_TIME_LIMIT_SECONDS = 600`. В Zod секунды целые в этих границах, кратность 60 не требуем; интерфейс работает минутами.
4. **Серверной защиты времени нет** (по умолчанию, как просили). Обоснование:
   - сервер не хранит начало сессии, нет сессий и результатов; серверный отсчёт потребовал бы состояния, то есть продуктового решения (результаты и попытки не сохраняются);
   - выигрыш от обхода — только лишние минуты на собственной оценке ученика; в библиотеке, где оценок нет, обход бессмысленен;
   - серверный лимит с подписанным токеном старта (HMAC `{shareToken, startedAt}`) возможен без БД и без данных ученика, но это новый эндпоинт `start`, новый шаг протокола и расхождение часов. Оставляем как «возможное усиление» в ADR, не делаем.
5. **Важная находка: нужно изменить контракт `finish`.** Сейчас `assertSelectionFits` отклоняет (400) ответ, у которого число отмеченных не равно числу верных. Неотвеченный вопрос (`[]`) сегодня невозможен, а при истечении времени он обязателен. **Решение:** в `finishQuiz` пустой массив `[]` означает «не отвечено» и даёт 0 баллов; любой непустой массив проверяется строго, как раньше. `check` остаётся строгим. Формат протокола не меняется (`answers` — по-прежнему массив массивов, схема `playFinishInputSchema` уже пропускает `[]`). Дыры нет: пустой ответ даёт 0, выгоды ученику не приносит. Сервер не знает про время, поэтому правило одинаково для всех режимов.
6. **Недоотвеченный текущий вопрос при истечении:** выбранные, но не отправленные варианты **не засчитываются** (в `answers` остаётся `[]`). Если ответ уже отправлен и идёт запрос `check` (режим «показывать ответы»), он засчитывается: `answers[index]` записывается до запроса.
7. **Старт отсчёта** — момент, когда загрузка завершилась и первый вопрос показан (в `start()` после заполнения `questions`). Метка `Date.now()` (не `performance.now()`: на спящем телефоне монотонные часы могут стоять), остаток считается по меткам, а не счётчиком секунд (фоновые вкладки замедляют `setInterval`); при `visibilitychange` пересчёт.
8. **Секундомер:** на экране результата показываем итоговое время одной строкой («Время: 3:42»). Мелкое решение моё; если не нужно, шаг 10 упрощается. При истечении лимита на результате показываем строку «Время вышло» (иначе ребёнок не поймёт, почему игра закончилась).
9. **Библиотека:** публичную карточку и список **не меняем** (таймер не показываем): `PUBLIC_SELECT` не трогаем, YAGNI. «Взять себе» таймер **копирует** (обязательно).
10. **Сохранение лимита в редакторе:** режим сохраняется сразу (как шкала); минуты — по `change` (потеря фокуса или Enter), а не на каждый символ, чтобы не слать PATCH на «1», «18», «180». Некорректное значение (вне 1–180, пусто) не отправляется, под полем — ошибка. При переключении на «Лимит» подставляется 600 с, значение сразу валидно.
11. **Превью учителя** (`?preview=1`) работает с таймером как обычная игра, самой игры менять не надо. Но страница `TeacherPreviewPage.vue` (витрина состояний редактора) требует правки, см. шаг 7.
12. **Состояние на фронте:** редактор — существующий `store.ts` (поле `quiz.timer`, нового стора нет). Игра — существующий `usePlayStore` (нужны `timer`, `startedAt`, `timedOut`, `expire()`), а «тикающее» значение остатка живёт в composable `useQuizTimer.ts`, в стор не пишется. Нового Pinia-стора не нужно.
13. **Версия задания (409):** учитель изменил таймер во время прохождения → `version` (по `updatedAt`) меняется, `finish` вернёт 409, показывается «Задание изменилось, начните заново». Поведение существующее, ничего не делаем.

## Files to Modify
- `docs/adr/README.md` — строка 0012 в оглавлении
- `docs/architecture.md` — раздел «Викторины и игра» (стр. ~423–431): модель `quizzes` (новые колонки и CHECK), `GET /play` (в ответе `timer`), `POST /finish` (пустой массив = «не отвечено»; строка про 400 «неверное число ответов» уточняется); при необходимости пара слов в «Сценарии игры» про таймер. С текущим текстом не конфликтует, только дополняется
- `packages/shared/schemas/quiz.ts` — константы, `quizTimerSchema`, `timer` в `quizInputSchema`, функции колонок
- `packages/shared/schemas/quizResponses.ts` — `timer` в `quizResponseSchema` (обязательное, без default) и `playQuizResponseSchema`
- `packages/shared/schemas/index.ts` — экспорты там **явные** (не `export *`): добавить `quizTimerSchema`, `timerFromColumns`, `timerToColumns`, `TIMER_MODES`, `MIN/MAX/DEFAULT_TIME_LIMIT_SECONDS` и тип `QuizTimer`
- `packages/shared/schemas/quiz.test.ts` — новые кейсы
- `apps/api/prisma/schema.prisma` — две колонки (ВЫСОКИЙ РИСК: миграция)
- `apps/api/src/features/quizzes/infrastructure/quizRepository.ts` — `QUIZ_SELECT`, `toStoredQuiz`, `create`, `updateOwned`
- `apps/api/src/features/quizzes/presentation/quizRoutes.ts` — `timer` в `toQuizResponse`
- `apps/api/src/features/play/types.ts` — `'timer'` в `Pick` у `PlayableQuiz`
- `apps/api/src/features/play/application/getPlayQuiz.ts` — `timer` в ответ (явно)
- `apps/api/src/features/play/application/finishQuiz.ts` и `answerValidation.ts` — `[]` = «не отвечено» (только в finish)
- `apps/api/src/features/library/infrastructure/libraryRepository.ts` — `COPY_SELECT` + колонки
- `apps/api/src/features/library/types.ts` — `LibraryQuizCopyRow`
- `apps/api/src/features/library/application/takeLibraryQuiz.ts` — `parseCopySource` собирает `timer`
- `apps/web/src/entities/quiz/newQuestion.ts` — `newQuiz()` с `timer: { mode: 'none' }`
- `apps/web/src/entities/quiz/types.ts` и `index.ts` — реэкспорт типа `QuizTimer` (если нужен вне схем)
- `apps/web/src/widgets/quiz-editor/store.ts` — `toQuizInput` переносит `timer`
- `apps/web/src/widgets/quiz-editor/components/QuizSettings.vue` — секция таймера
- `apps/web/src/pages/TeacherPreviewPage.vue` — **обязательно** (шаг 7): страница пишет `state.quiz` прямо в Pinia через локальный интерфейс-каст, поэтому ошибки типов не будет, но `QuizSettings` начнёт читать `store.quiz.timer.mode`, и кейсы `settings` / `settings-error` упадут в рантайме (а это страница, на которой ui-designer проверяет вёрстку). Добавить `timer` во все объекты `state.quiz` и в интерфейс `QuizEditorPreviewState`, а также кейсы `settings-stopwatch` и `settings-limit`
- `apps/web/src/widgets/quiz-play/QuizPlay.vue` — подключить `useQuizTimer` (всегда смонтирован)
- `apps/web/src/widgets/quiz-play/store.ts` — таймер, истечение, `timedOut`
- `apps/web/src/widgets/quiz-play/components/PlayQuestion.vue` — подключить `PlayTimer`
- `apps/web/src/widgets/quiz-play/components/PlayResult.vue` — «Время вышло» / итоговое время
- `apps/web/src/assets/styles/global.scss` — `--z-play-timer` каскадом, если таймер «залипающий» (после `--z-language-menu`)
- `apps/web/src/shared/i18n/locales/{ru,en,de,fr}.ts` — ключи
- `apps/web/tests/e2e/quizPlay.spec.ts` — мок `/api/play/**` отдаёт `quizBody` без `timer`: добавить `timer: { mode: 'none' }` (иначе ответ не пройдёт `playQuizResponseSchema`); ожидание `answers` = `[[0]]` не меняется. Остальные e2e (`library.spec.ts`, `natStudents.spec.ts`) таймера не касаются, перепроверить grep'ом при реализации

## Files to Create
- `docs/adr/0012-quiz-timer.md`
- `apps/api/prisma/migrations/<timestamp>_add_quiz_timer/migration.sql` (создаёт Prisma, CHECK дописываются вручную)
- `apps/web/src/widgets/quiz-play/useQuizTimer.ts` — тик по меткам времени, остаток, пороги
- `apps/web/src/widgets/quiz-play/formatClock.ts` (+ `formatClock.test.ts`) — `м:сс`, чистая функция
- `apps/web/src/widgets/quiz-play/components/PlayTimer.vue` — «таблетка»
- Тесты: `apps/web/src/widgets/quiz-play/useQuizTimer.nuxt.test.ts` (или `.test.ts`, если без Nuxt), `apps/web/src/widgets/quiz-editor/quizSettingsTimer.nuxt.test.ts`

## Что проверено, а что — при реализации
Прочитано: схемы shared, `quizRepository`, `quizRoutes`, `updateQuiz`, `createQuiz`, `takeLibraryQuiz`, `libraryRepository`, play-use-cases, `quizFakes.ts`, `schemas/index.ts`, `QuizSettings.vue`, редакторский и игровой сторы, `TeacherPreviewPage.vue`, `architecture.md` (разделы про викторины и игру). Выводы:
- `updateQuiz`/`createQuiz` передают весь `input` и менять не нужно; фейковый репозиторий `quizFakes.ts` использует `...input`, поэтому `timer` проходит сам (поле нужно только в фикстурах, которые пишутся вручную).
- Существующих тестов, ожидающих 400 на пустой выбор в `finish`, не нашла: `play.test.ts:166` (`selected: []`) относится к `check`, остаётся строгим; кейсы 400 в `playRoutes.int.test.ts` (стр. ~196–199) пустых массивов не содержат. При реализации перепроверить grep'ом `\[\]` в обоих файлах.
- Не открыто, проверить при реализации: `app.ts` (связывание play/library; по структурным типам правки не нужны), `getQuiz.ts`, `playApi.nuxt.test.ts`, `quizApi.nuxt.test.ts`, `playUrl*`, e2e `library.spec.ts`.

## Steps

### 0. ADR 0012 и архитектурный документ [small] — основная сессия / fullstack-developer
Файл `docs/adr/0012-quiz-timer.md` по шаблону из `docs/adr/README.md`; статус «Принято», дата 2026-11-16; строка в оглавлении README. Обновить `docs/architecture.md` (см. «Files to Modify»). Содержание ADR:
- **Контекст:** учителю нужен таймер; результаты не хранятся, сервер без сессий.
- **Решение:** три режима; лимит на всё задание, границы 1–180 мин (хранится секундами); таймер — часть настроек задания и копируется при «Взять себе»; в публичной карточке библиотеки не показывается; отсчёт на клиенте от показа первого вопроса; по истечении неотвеченные вопросы = 0, текущий неотправленный выбор не засчитывается; `finish` принимает `[]` как «не отвечено»; процент и оценка — только по проценту, скорость на оценку не влияет; значение лимита публично и не секретно.
- **Последствия / принятый риск:** лимит соблюдается только клиентом, ученик может остановить таймер (DevTools, офлайн, подмена часов) и сдать позже; серверного ограничения нет, потому что нужны были бы сессии/состояние на сервере (противоречит «результаты не сохраняются»). Для оценок это слабое место: если появятся «контрольные», решение пересматриваем (новый ADR, возможный вариант: HMAC-токен старта без БД). Персональных данных нет.
- **Отвергнутые варианты:** лимит на вопрос; серверный таймер с токеном старта; штраф за скорость; таймер в публичной карточке библиотеки; отдельная таблица настроек таймера; JSON-поле `settings`.
- **Критерий готовности:** ADR читается самостоятельно; оглавление и architecture.md обновлены. Проверка: просмотр файлов.

### 1. shared: схема и константы [small] — fullstack-developer
`packages/shared/schemas/quiz.ts`:
- константы `TIMER_MODES = ['none','stopwatch','limit']`, `MIN_TIME_LIMIT_SECONDS`, `MAX_TIME_LIMIT_SECONDS`, `DEFAULT_TIME_LIMIT_SECONDS`;
- `quizTimerSchema` — `z.discriminatedUnion('mode', [...])`, секунды `int().min().max()`; объекты строгие;
- в `quizInputSchema` — `timer: quizTimerSchema.default({ mode: 'none' })` (рядом с `group`);
- `timerFromColumns(mode, seconds)` и `timerToColumns(timer)` — чистые функции; `timerToColumns` **всегда** возвращает обе колонки (`seconds: null` для не-лимита), `timerFromColumns` парсит результат через `quizTimerSchema`, ошибку превращает в throw в репозитории (как `toStoredQuiz`);
- тип `QuizTimer = z.infer<...>`; всё добавить в явные экспорты `packages/shared/schemas/index.ts`.
`quizResponses.ts`: в `quizResponseSchema` `quiz.extend({ timer: quizTimerSchema })` (обязательное: сервер всегда шлёт); в `playQuizResponseSchema.quiz` — `timer: quizTimerSchema`. `playFinishInputSchema` НЕ меняется.
Потребители shared: `apps/api` (quizzes, library, play), `apps/web` (entities/quiz, widgets/quiz-editor, widgets/quiz-play, фикстуры тестов и e2e).
**Готово, когда:** новые кейсы в `quiz.test.ts` (`none`/`stopwatch` без секунд — ок; `limit` без секунд, 59, 10801, 1.5, строка — ошибка; `none` с лишними `seconds` — ошибка/отброшено строгостью; поле отсутствует → `none`; round-trip `timerFromColumns`/`timerToColumns`) зелёные. Проверка: `npm run test -w packages/shared && npm run typecheck -w packages/shared`. Ожидаемо: typecheck api и web пока падает, чиним в следующих шагах.

### 2. Prisma + миграция [medium] — fullstack-developer ★ ВЫСОКИЙ РИСК
- `schema.prisma`, модель `Quiz`: `timerMode String @default("none") @map("timer_mode")`, `timeLimitSeconds Int? @map("time_limit_seconds")`; в комментарии над моделью упомянуть, что CHECK добавлены вручную в миграции `add_quiz_timer`.
- Миграцию создать `npm run db:migrate -w apps/api -- --create-only --name add_quiz_timer` (в локальном контейнере), **не применять, пока не дописаны CHECK**. Затем вручную в SQL после `ALTER TABLE ... ADD COLUMN` добавить (как в `create_quizzes`, с комментарием «Добавлено вручную»):
  - `quizzes_timer_mode_check`: `timer_mode IN ('none','stopwatch','limit')`;
  - `quizzes_time_limit_check`: `(timer_mode = 'limit' AND time_limit_seconds IS NOT NULL AND time_limit_seconds BETWEEN 60 AND 10800) OR (timer_mode <> 'limit' AND time_limit_seconds IS NULL)`.
    **`IS NOT NULL` в ветке `limit` обязателен, его нельзя «упрощать»:** при `time_limit_seconds = NULL` выражение `BETWEEN` даёт NULL, а Postgres CHECK пропускает NULL; без явного `IS NOT NULL` строка `(limit, NULL)` прошла бы, и инвариант «CHECK ≡ Zod» нарушился бы. Написать то же в SQL-комментарии миграции.
  Константы 60/10800 в SQL дублируют `MIN/MAX_TIME_LIMIT_SECONDS`; в комментарии сослаться на shared.
- После применения: `npm run db:generate -w apps/api`.
Риск: миграция «необратима» по правилам проекта, но она аддитивная: существующие строки получают `none`/NULL (`NOT NULL DEFAULT` в Postgres 11+ без перезаписи таблицы), CHECK для них истинен. Откат только вручную: `DROP CONSTRAINT`, `DROP COLUMN`.
**Готово, когда:** миграция применяется на чистой и на заполненной БД; в psql INSERT/UPDATE с `(limit, NULL)`, `(none, 600)`, `(stopwatch, 600)`, `(limit, 30)`, `(limit, 20000)`, `(foo, NULL)` отклоняются CHECK; `(limit, 600)`, `(none, NULL)`, `(stopwatch, NULL)` проходят. Проверка: `npm run db:deploy -w apps/api` на dev-БД, `npm run typecheck -w apps/api`.
**Нужно подтверждение пользователя перед применением.** На прод не катить без отдельной просьбы (память «Images deploy requirements»: миграции прода идут вместе с деплоем).

### 3. API: репозиторий викторин и ответ кабинета [small] — fullstack-developer
- `quizRepository.ts`: `QUIZ_SELECT` + `timerMode`, `timeLimitSeconds`; `toStoredQuiz` передаёт `timer: timerFromColumns(...)` в `quizInputSchema.safeParse`; `create` и `updateOwned` пишут `timerToColumns(input.timer)` (при смене на не-лимит секунды обязательно `null`, иначе CHECK отклонит).
- `quizRoutes.ts`: `toQuizResponse` добавляет `timer: quiz.timer`.
- Use-cases `createQuiz.ts`/`updateQuiz.ts`/`getQuiz.ts` не меняются (передают весь `input`), каждый остаётся одним файлом.
- `listByTeacher` (сырой SQL списка) не трогаем: в списке таймер не нужен.
**Готово, когда:** `quizzes.test.ts` с фейками проходят; интеграционный `quizRoutes.int.test.ts` — с новым полем. Проверка: `npm run typecheck -w apps/api && npm run test -w apps/api && npm run test:integration -w apps/api`.

### 4. API: игра ученика [small] — fullstack-developer
- `play/types.ts`: в `Pick` добавить `'timer'`.
- `getPlayQuiz.ts`: в `quiz` явно `timer: quiz.timer` (сборка полей остаётся явной).
- `finishQuiz.ts` / `answerValidation.ts`: пустой выбор = «не отвечено» → 0 баллов; для непустого — прежняя проверка. Отдельным маленьким предикатом, а не ослаблением `assertSelectionFits` (чтобы `checkAnswer` остался строгим).
- `checkAnswer.ts` не меняется.
**Готово, когда:** `play.test.ts` — новые кейсы: `finish` с `[[0],[],[]]` даёт процент по одному ответу; `[]` во всех вопросах = 0%; `[[0,0]]`, неверное число отмеченных у непустого, индекс вне диапазона — по-прежнему 400; `getPlayQuiz` возвращает `timer`; `check` с пустым `selected` по-прежнему 400. Проверка: `npm run test -w apps/api`.

### 5. API: «Взять себе» переносит таймер [small] — fullstack-developer
- `libraryRepository.ts`: в `COPY_SELECT` — `timerMode`, `timeLimitSeconds`. `PUBLIC_SELECT` и список — без изменений.
- `library/types.ts`: в `LibraryQuizCopyRow` — `timerMode: string`, `timeLimitSeconds: number | null`.
- `takeLibraryQuiz.ts`: `parseCopySource` передаёт `timer: timerFromColumns(row.timerMode, row.timeLimitSeconds)`.
**Готово, когда:** `takeLibraryQuiz.test.ts` и `libraryTake.int.test.ts` с источником `limit/900` создают копию с тем же `timer`. Проверка: команды шага 3.

### 6. Фронт: entities и стор редактора [small] — vue-expert или fullstack-developer
- `entities/quiz/newQuestion.ts`: `newQuiz()` → `timer: { mode: 'none' }`.
- `widgets/quiz-editor/store.ts`: `toQuizInput` копирует `timer`; других изменений нет (isDirty/save работают с целым `quiz`; `issuesToFieldErrors` даёт ключи вида `timer.seconds`). Нового стора нет.
- Тип `QuizTimer` — реэкспорт из `entities/quiz/types.ts` и `index.ts`.
**Готово, когда:** typecheck web проходит (после правки фикстур, шаг 12). Проверка: `npm run typecheck -w apps/web`.

### 7. Фронт: редактор, секция «Таймер» [medium] — ui-designer (вёрстка) + vue-expert (логика)
Первым делом обновить `TeacherPreviewPage.vue` (`timer` во все `state.quiz`, кейсы `settings-stopwatch`, `settings-limit`), иначе витрина падает в рантайме.
`QuizSettings.vue`, отдельный блок-карточка после блока оценки, по тем же паттернам, что выбор шкалы:
- `fieldset` + `legend` и три радио-сегмента: «Без таймера» / «Секундомер» / «Лимит времени» (как `quiz-settings__scales`, три колонки на мобильном); под ними подсказка для выбранного режима (понятность важнее компактности, память «UI clarity first»).
- В режиме «Лимит»: `input type="number" inputmode="numeric"` с `min=1 max=180 step=1`, подпись «Минут на всё задание», `aria-describedby` на подсказку и ошибку; коммит по `change`; клиентская проверка диапазона только для удобства, границы из shared (без хардкода), источник истины — Zod на сервере.
- Смена режима: `store.quiz.timer = …; if (!(await store.save())) store.quiz.timer = previous` — как `chooseScale`. При входе в «Лимит» — `DEFAULT_TIME_LIMIT_SECONDS`; секунды вне «Лимит» не хранятся (форма union).
- Перевод минут ↔ секунды — одна функция; нецелые минуты не принимаются.
- Вёрстка только мобильная (память «Mobile-first only»); BEM, `rgb(r g b / a)`, `prefers-reduced-motion`.
**Готово, когда:** режим переключается, автосохраняется, после перезагрузки восстанавливается; некорректное число не уходит в сеть и показывает ошибку. Проверка: nuxt-тест `quizSettingsTimer.nuxt.test.ts` (переключение режимов → `quizApi.update` вызван с нужным `timer`; 0/181/пусто → без вызова), ручная проверка на `/teacher-preview`-витрине и в редакторе.

### 8. Фронт: логика таймера в игре [medium] — vue-expert
`quiz-play/store.ts`:
- состояние `timer` (из ответа API), `startedAt: number | null`, `timedOut: boolean`;
- `start()`: `startedAt` и `timer` ставятся в конце загрузки (после заполнения `questions`); `reset()` обнуляет `startedAt` и `timedOut`;
- действие `expire()`: идемпотентно (только при `phase !== 'result'` и `!timedOut`); ставит `timedOut = true`, отбрасывает неотправленный выбор текущего вопроса и вызывает `finish()` через `run`, чтобы сбой сети отображался существующим состоянием «failed» + «Повторить» (`retryAction` повторяет `finish`); если в этот момент `busy` (идёт `check`), ждёт его окончания, затем `finish` (в `run`/`finally` проверять `timedOut`). Ответ `check`, пришедший после истечения, не должен менять фазу на `feedback`: проверять `timedOut` перед записью `correct`/`phase`.
- В фазе `feedback` при истечении `finish` вызывается сразу (текущий ответ уже в `answers`).
- После `phase === 'result'` отсчёт закончен; для секундомера итоговое время фиксируется (`elapsedSeconds`) в момент получения результата.
**Жизненный цикл тикера:** `PlayQuestion` размонтируется, когда `status` = `failed` / `changed` (показывается блок ошибки), поэтому тикер внутри `PlayTimer` на это время остановился бы. Решение: `useQuizTimer` подключается в `QuizPlay.vue` (всегда смонтирован), `PlayTimer` только показывает значения. После `timedOut = true` «Повторить» всегда запускает `finish`, а не `check`; если время вышло в состоянии `failed`, `expire` сработает на следующем тике.
`useQuizTimer.ts`: принимает `startedAt` и режим, отдаёт `elapsedSeconds`, `remainingSeconds`, `isLow`, `announcement`; тик раз в секунду по `Date.now()`, не счётчиком; пересчёт на `visibilitychange`; `onScopeDispose` останавливает `setInterval`; при `remaining <= 0` один раз вызывает `store.expire()`. В режиме `none` не стартует.
`formatClock.ts`: `м:сс` (минуты без ведущего нуля, «180:00»), никогда не отрицательное.
Порог «мало времени» (подсветка и объявление): `LOW_TIME_SECONDS = min(60, 25% лимита)`, константы именованные.
**Готово, когда:** юнит-тесты на фейковых таймерах (`vi.useFakeTimers` + `setSystemTime`): лимит 60 с → `expire` вызывается ровно 1 раз на 60-й секунде, не вызывается при `none`/`stopwatch`; `finish` вызывается с `answers`, где неотвеченные = `[]`, неотправленный выбор текущего — тоже `[]`; при in-flight `check` порядок «check → finish»; повторный `expire` игнорируется; после `result` таймер не тикает; перезапуск («Пройти ещё раз») сбрасывает отсчёт; истечение в состоянии `failed` обрабатывается. Проверка: `npm run test -w apps/web`.

### 9. Фронт: компонент и вёрстка таймера [medium] — ui-designer
`PlayTimer.vue`, вывод в `PlayQuestion.vue` в блоке `.play-question__top` или залипающей под ним полосой (`position: sticky`, чтобы виден при прокрутке длинного вопроса; не перекрывать кнопку «Ответить»; `z-index` через `--z-play-timer` в `global.scss` каскадом от последнего значения).
- Тёмно-синяя «таблетка» `#171B3A`, цифры шрифтом Unbounded (по `docs/architecture.md` таймер — одно из мест для Unbounded), `font-variant-numeric: tabular-nums`; иконка часов; в «лимите» зелёный акцент, при малом остатке оранжевый (`--color-orange`) **плюс** признак не цветом (иконка/надпись «Осталось мало»).
- Секундомер: время растёт, нейтральный цвет, без тревожных состояний; лимит: остаток убывает.
- Доступность: контейнер `role="timer"` (implicit `aria-live="off"`: секунды не озвучиваются), статичная `aria-label`. Отдельный визуально скрытый `role="status"` (подход `.play-question__sr-only`, уже есть в компоненте) объявляет только «Осталась 1 минута» (порог) и «Время вышло». Никаких `aria-live` на цифрах.
- `prefers-reduced-motion: reduce`: без пульсации и переходов; пульсация низкого остатка (если будет) только в `no-preference`.
- Фокус: `PlayQuestion.moveFocus` не должна перехватываться таймером (он не фокусируемый).
**Готово, когда:** на 360–390 px таймер не ломает шапку, контраст белых цифр на `#171B3A` ≥ 4.5:1, ничего не прыгает при смене цифр. Проверка: просмотр в браузере (ui-designer) на `?preview=1` с каждым режимом.

### 10. Фронт: экран результата [small] — widget-developer
`PlayResult.vue`: при `store.timedOut` строка «Время вышло — неотвеченные вопросы засчитаны как неверные»; в режиме секундомера «Время: м:сс» (из `elapsedSeconds`). Процент и оценка без изменений, фокус на заголовок остаётся.
**Готово, когда:** nuxt-тест на оба варианта.

### 11. i18n [small] — widget-developer
Одинаковый набор ключей в `ru.ts`, `en.ts`, `de.ts`, `fr.ts` (`locales.test.ts` проверяет паритет). Группы:
- `teacher.quizEditor.settings.timer.*`: заголовок, три названия режимов, три подсказки, подпись поля минут, плюральная подпись (ru — три формы), сообщения об ошибке диапазона;
- `play.timer.*`: `label`, `lowAnnouncement`, `timeUp`, `elapsed`, `timedOutNote`.
**Внимание:** локали не обновляются в dev по HMR. После правок перезапустить контейнер web, иначе в интерфейсе сырые ключи (память «i18n dev no HMR»).
**Готово, когда:** `locales.test.ts` зелёный, ручной просмотр на 4 языках. Проверка: `npm run test -w apps/web`, рестарт контейнера `web`.

### 12. Тесты: обязательные изменения существующих (выделено отдельно) [medium] — tester
Менять только ради нового обязательного поля; логику и ожидания не переписывать.
- `apps/web/src/widgets/quiz-play/store.nuxt.test.ts`, `entities/quiz/playApi.nuxt.test.ts`, `components/playFocus.nuxt.test.ts`, `components/playImages.nuxt.test.ts` — фикстура ответа игры: `timer: { mode: 'none' }` (иначе стор читает `undefined.mode`).
- `apps/web/src/entities/quiz/quizApi.nuxt.test.ts`, `newQuestion.test.ts` (ожидаемая форма `newQuiz()` получает `timer`), `widgets/quiz-editor/store.nuxt.test.ts`, `quizEditor.nuxt.test.ts` — фикстуры ответа кабинета с `timer`.
- `apps/web/tests/e2e/quizPlay.spec.ts` — мок игры с `timer` (см. выше).
- `apps/api/tests/takeLibraryQuiz.test.ts` (фикстура `LibraryQuizCopyRow` получает колонки), интеграционные `quizRoutes.int.test.ts`, `playRoutes.int.test.ts`, `libraryTake.int.test.ts`, `quizzes.int.test.ts` — поле в фикстурах и ожидаемых ответах; `quizFakes.ts`, `quizzes.test.ts`, `play.test.ts` — по необходимости (`PlayableQuiz` получает `timer`: фикстура `play.test.ts:22`).
- `apps/web/src/widgets/my-activities/*`, `entities/activity/*` — **не затрагиваются** (в списке таймера нет).
Новые тесты перечислены в шагах 1, 3–5, 7, 8, 10; плюс интеграционный на БД: сохранение `limit/900` и чтение; смена `limit` → `none` обнуляет секунды; прямой INSERT с нарушением CHECK падает (включая `(limit, NULL)`).
**Проверка:** `npm run typecheck && npm run lint && npm test`, `npm run test:integration -w apps/api`.

### 13. Ревью [small] — code-reviewer
Независимое ревью по `git diff` после тестов: валидация только в Zod, `isCorrect` не в публичных ответах (в `getPlayQuiz` поля собраны явно), `PUBLIC_SELECT` не расширен, CHECK ≡ Zod, `npm audit` (новых зависимостей нет). critical/high возвращаются автору. Коммитов нет: коммитит пользователь.

## Порядок и независимые части
Последовательно 0 → 1 → 2 (+ подтверждение) → 3 → 4 → 5; шаги 3, 4, 5 после 2 независимы друг от друга (можно параллельно). Фронт: 6 → 7 (редактор) и 8 → 9 → 10 (игра) — две независимые ветки после шага 1 (их можно вести параллельно с бэкендом 3–5 на моках; целостная проверка после 5). 11 (i18n) — вместе с 7/9/10, финальная сверка после них. 12–13 — в конце.

Агенты: ADR и shared, Prisma, API — `fullstack-developer`; логика игры и composable — `vue-expert`; вёрстка редактора и таймера — `ui-designer`; экран результата и локали — `widget-developer`; тесты — `tester`; ревью — `code-reviewer`.

## Risks & Edge Cases
- **Миграция Prisma — высокий риск** (аддитивная, значения по умолчанию; CHECK дописываются руками; применять после подтверждения).
- **Неотвеченные вопросы ломали `finish` (400):** без шага 4 лимит времени невозможен. Единственное изменение серверного контракта, только для `finish`.
- **Обход таймера** (остановить вкладку/сеть, подмена часов, прямой `POST /finish` в любой момент): принят, фиксируется в ADR. Для оценок слабое место.
- **Гонка истечения и `check`/`finish`:** истечение во время запроса, двойной `finish`, ответ `check` после результата. Закрывается флагом `timedOut` и идемпотентным `expire()` (тесты шага 8).
- **Фоновая вкладка, сон устройства:** считаем по `Date.now()`, на `visibilitychange` пересчёт; после пробуждения при истёкшем времени сразу `expire`.
- **Сбой сети в момент истечения:** `finish` через `run` → «Не получилось, попробуйте ещё раз» + «Повторить»; повтор запускает только `finish`.
- **Версия 409** при правке задания учителем во время игры — существующее поведение.
- **Автосохранение поля минут:** PATCH только по `change` и только при валидном значении; иначе шторм запросов и упор в `limiters.write`.
- **Старые клиенты и данные:** `timer` по умолчанию `none`; строки БД после миграции валидны.
- **Рассинхрон БД и кода:** `timerFromColumns` с неверной комбинацией → 500, а не молчаливая подмена.
- **Доступность:** цвет не единственный признак «мало времени»; нет `aria-live` на секундах; reduced-motion.
- **Изменения `packages/shared` затрагивают** api (quizzes, library, play) и web (entities/quiz, quiz-editor, quiz-play, фикстуры тестов, e2e); экспорты в `schemas/index.ts` явные.
- **Не затрагиваем:** `src/shared/nat/*`, `widgets/intro-player`, список заданий, публичную карточку библиотеки, rate limiter (одна реплика остаётся). Новых зависимостей нет.
- **Персональные данные:** не собираются; лимит — публичная настройка.

## Open Questions
Блокирующих вопросов нет; допущения 5, 6, 8, 9 можно отменить при ревью плана. Нужно решение пользователя:
1. Подтвердить применение миграции (шаг 2) перед выполнением.
2. Нужен ли таймер в публичной карточке библиотеки (по умолчанию нет).
3. Устраивает ли «выбор текущего вопроса, не отправленный к концу времени, не засчитывается» (по умолчанию да).

## Что проверить вручную (пользователю)
- Редактор → «Настройки»: три режима переключаются и сохраняются, подсказки понятны на 4 языках; ввод 0, 181, пусто, `5,5` показывает ошибку и ничего не сохраняет; после перезагрузки режим и минуты на месте; на 360 px ничего не вылезает.
- Игра (превью и по ссылке): «таблетка» читается, цифры не «пляшут», не закрывает вопрос и кнопку «Ответить», остаётся видна при прокрутке; в режиме «Лимит» при малом остатке оранжевый и объявление для скринридера (VoiceOver/TalkBack) только на пороге и в конце, секунды не озвучиваются; с «Уменьшением движения» анимаций нет.
- Лимит 1 минута: дождаться конца при частично отвеченном задании: игра завершается сама, неотвеченные неверны, неотправленный выбор не засчитан, оценка и процент по шкале; видна строка «Время вышло».
- Секундомер: итоговое время на экране результата; «Пройти ещё раз» сбрасывает отсчёт.
- «Взять себе» задание с лимитом из библиотеки: копия имеет те же настройки таймера.
- Задание без таймера (старые задания): игра как раньше, таймера нет.
