# План: шаги 10 и 11 библиотеки на фронтенде (карточка задания и «Взять себе»)

## Цель
Публичная карточка задания `/library/quiz/<номер>-<slug>` с превью вопросов без правильных ответов и кнопка «Взять себе», которая копирует задание в кабинет учителя (гость сначала входит и возвращается на карточку).

Шаги 10 и 11 из `.claude/plans/library.md`. Без SSR и SEO (ADR-0011): страницы `/library/**` уже в `CLIENT_ONLY_PATHS` в `apps/web/nuxt.config.ts` для всех языковых префиксов, `routeRules` менять не нужно. Мета-теги `robots`/`canonical` на карточке не ставим (как у соседних страниц библиотеки — только `title`).

## Решения пользователя (2026-11-16)
1. После «Взять себе» ведём в редактор копии `/teacher/quiz/<id>`.
2. Гость взять задание не может: только вошедший или зарегистрированный. После возврата гостя на карточку он нажимает кнопку сам, автоматического копирования нет.
3. `next` для Google-входа и регистрации — позже, отдельным шагом по `auth`. Следствие для диалога: после регистрации и входа через Google гость на карточку не вернётся — это принятое ограничение.
4. Гостю показывается та же кнопка «Взять себе». По нажатию открывается окно с двумя действиями: «Войти» и «Зарегистрироваться» (вместо подсказки под кнопкой и прямого перехода). Оба действия ведут с `next` = адрес карточки.
5. 404 карточки — полноэкранная страница ошибки через `showError`.
6. Подсказка при сетевой ошибке «если задание уже скопировалось, оно в «Моих заданиях»» остаётся.
7. Для `take` добавляем в `apiClient` необязательную опцию `timeoutMs` (60 с); остальные запросы не меняются. Что Caddy и API не обрывают такой запрос раньше — проверить при деплое.

Правки плана из-за п. 4: в фиче `take-library-quiz` событие `login-required` остаётся, но виджет `library-quiz` по нему не навигирует сразу, а открывает окно (компонент `LibraryLoginDialog` в виджете, нужны его тесты и доступность: фокус, Esc, возврат фокуса). Строка таблицы состояний «Гость» и подпись «Войдите, чтобы…» заменяются этим окном.

## Что найдено в ADR и документах
- ADR-0005: копия `is_public = false`, картинки копируются файлами, связи с оригиналом нет, копия входит в лимит 100 — подтверждает поведение API; про интерфейс карточки, 404 и куда вести после успеха ничего не фиксирует.
- ADR-0007: библиотека публична, вкладки в кабинете нет, путь — ссылка в шапке; адрес карточки и 404 не описывает. Его фраза «SSR — шаг 10 плана» устарела (заменена ADR-0011, SEO — шаг 13).
- ADR-0008: поиск только внутри раздела — на карточку не влияет.
- ADR-0011: адреса `/library`, `/library/<группа>`, `/library/quiz/<номер>-<slug>` зафиксированы; SEO последним. Вывод: вопросы 1 и 5 из «Open Questions» остаются именно вопросами пользователю — ни один ADR их не решает.

## Что найдено в коде (опорные факты)
- Уже есть: `entities/library` (`libraryApi.list/groups`, `useLibraryGroups` на `useState`, типы), `widgets/library-browser` (`LibraryBrowser.vue` + `useLibraryBrowser.ts`, карточки списка пока без ссылок; теста у виджета нет), `widgets/library-groups`, страницы `LibraryPage.vue` и `LibraryGroupPage.vue`, тонкие `app/pages/library/index.vue` и `[group].vue` (образец: `definePageMeta({ name, preFooter: false })`).
- shared готов (проверено): `libraryQuizResponseSchema` (`{ quiz: {...summary, questions: [{text, imageUrl, options: [{text, imageUrl}]}]} }`, без `isCorrect` и `selectCount`), `libraryTakeResponseSchema` (`{ quizId }`), `LIBRARY_PREVIEW_QUESTIONS = 5`; `@nataskium/shared/routes` экспортирует `LIBRARY_PAGE_PATHS`, `libraryGroupPath`, `libraryQuizPath`; `@nataskium/shared/library` — `parseQuizSlug`, `slugifyTitle`. Изменений в `packages/shared` не нужно.
- Механизм `?next=` УЖЕ есть: `app/middleware/teacher-auth.ts` ставит `next: to.fullPath`, `LoginPage.vue` после email-входа делает `navigateTo(unroutedPath(safeNextPath(route.query.next)))`, `guest-only.ts` уводит уже вошедшего на `next`. `safeNextPath` (`features/auth/redirect.ts`) пропускает только путь сайта, отклоняет `//`, `/\`, управляющие символы; `useUnroutedPath` не добавляет второй языковой префикс. Новой логики возврата не нужно — только вызвать вход с `query.next`.
- ОГРАНИЧЕНИЕ (проверено по коду): `next` работает только для входа по email и паролю. `GoogleCallbackPage.vue` и `VerifyEmailPage.vue` всегда ведут в `AFTER_SIGN_IN_PATH` (`/teacher`), `RegisterPage.vue` `next` не читает и не передаёт. Гость, выбравший Google или регистрацию, на карточку не вернётся.
- Сессия: `layouts/default.vue` на mount вызывает `void restoreSession()`; на публичной странице `useAuthStore().status` сначала `'unknown'`, затем `'authenticated'`/`'anonymous'`. Если refresh не удался из-за сети, статус остаётся `'unknown'`.
- Защищённые запросы: `authorizedRequest((accessToken) => api...(accessToken))` из `@/features/auth` (один refresh и повтор на 401; без сессии `ApiError(401)`). `apiRequest(path, schema, { method, body, accessToken })` из `@/shared`; `ApiError { status, reason, retryAfterSeconds }`, `NETWORK_ERROR_STATUS = 0`.
- Конвенция: features не импортируют features (ни одного `@/features/` внутри `src/features`); `authorizedRequest` и `useAuthStore` используют виджеты. Поэтому запрос с токеном в фичу передаётся пропом.
- API take (`takeLibraryQuiz.ts`, `libraryErrors.ts`, `limits.ts`): 201 `{quizId}`; 401; 404 (нет/скрыто/удалено); 409 (лимит 100, проверяется до копирования файлов); 503 (хранилище картинок не настроено или `ExternalServiceError` при копировании); 429 (на учителя 30/час, на IP 100/час). Копирование картинок идёт по одной на воркер, 4 воркера, на каждую — `copyFile` в S3 и `INSERT` строки.
- ТАЙМАУТ: `apiClient` обрывает любой не-файловый запрос через `REQUEST_TIMEOUT_MS = 15_000` (при `FormData` — 120 с). Сервер при этом `take` не отменяет и доделает копию. Для задания с десятками и сотнями картинок (до ~350) `take` может идти дольше 15 с: клиент покажет «нет связи», копия при этом появится, повторный клик создаст вторую и съест лимит. Подробности — вопрос 7.
- Редактор копии: `/teacher/quiz/<id>` (`${TEACHER_PATHS.quizEdit}/${id}`, `middleware: 'teacher-auth'`), в нём есть ссылка «к заданиям». «Мои задания» (`/teacher`) грузят список `onMounted`, порядок `createdAt desc` — копия первая.
- 404: `app/error.vue` передаёт в `ErrorPage` `error.status`; `ErrorPage` по `status === 404` показывает `errorPage.notFound.*`, иначе текст про серверную ошибку. В коде web нет ни одного вызова `showError`/`createError` (e2e `errorPage.spec.ts` подставляет `payload.error = { status: ... }`). Страница группы показывает 404 инлайн (`library.groupNotFound`).
- Тесты web: `src/**/*.test.ts` (unit, node) и `src/**/*.nuxt.test.ts` (nuxt + happy-dom); API мокаются `vi.spyOn(api, 'метод')`, навигация — `mockNuxtImport('navigateTo', ...)`, сессия — `useAuthStore().setSession(...)`. E2E — Playwright, `apps/web/tests/e2e/*.spec.ts`, перехват `/api/**` (образец `quizPlay.spec.ts`).

## Files to Modify
- `apps/web/src/entities/library/libraryApi.ts` — `get(number)` и `take(number, accessToken)`.
- `apps/web/src/entities/library/types.ts`, `index.ts` — типы `LibraryQuizResponse`/`LibraryQuizDetails`, `LibraryTakeResponse`, экспорт.
- `apps/web/src/widgets/library-browser/LibraryBrowser.vue` — заголовок плитки списка становится ссылкой на карточку (`localePath(libraryQuizPath(number, title))`).
- `apps/web/src/shared/i18n/locales/{ru,en,de,fr}.ts` — ключи `library.quiz.*`, `library.take.*` (паритет).
- `apps/web/src/shared/api/apiClient.ts` — ТОЛЬКО если принят вопрос 7: необязательная опция `timeoutMs` (по умолчанию как сейчас), поведение остальных запросов не меняется; плюс тест в `apiClient`-тестах.
- `.claude/plans/library.md` — отметки о выполнении шагов 10 и 11 (по завершении).

## Files to Create
**app (Nuxt-роутинг):**
- `apps/web/app/pages/library/quiz/[slug].vue` — тонкий: импорт `LibraryQuizPage`, `definePageMeta({ name: 'library-quiz', preFooter: false })`, `slug` из `route.params.slug` через `computed`, как в `[group].vue`. Статический сегмент `quiz` выигрывает у `[group]`; slug `quiz` для групп зарезервирован в БД.

**pages:**
- `apps/web/src/pages/LibraryQuizPage.vue` — принимает `slug: string`; `parseQuizSlug` → невалидный → сразу 404; `useSeoMeta({ title })`; показывает виджет; на `not-found` вызывает `showError`.

**widgets/library-quiz:**
- `LibraryQuiz.vue` — главный компонент: ссылка «← К разделу» (`libraryGroupPath(groupSlug)` через `localePath`), название (`<h1>`, только текстом), мета (группа, «Вопросов: N», дата), бейдж «С оценкой/Без оценки» (стили как у `library-browser__grade`), блок «Вопросы» (превью), примечание о скрытых вопросах, блок «Взять себе»; состояния загрузки/ошибки с «Повторить».
- `useLibraryQuiz.ts` — `(number: Ref<number>)` → `{ status: 'loading'|'ready'|'notFound'|'error', quiz, load }`; защита от устаревшего ответа (как `requestId` в `useLibraryBrowser`); 404 → `notFound`, остальное → `error`.
- `components/LibraryQuizQuestion.vue` — один вопрос: номер, текст, картинка вопроса, список вариантов (`<ul>`, текст и/или картинка), без radio/checkbox; `alt=""` и скрытие битой картинки по `@error`, как в `PlayQuestion`. Вместе с `LibraryQuizMeta.vue` подкомпонентов 2, папка `components/` оправдана (если мета остаётся в `LibraryQuiz.vue` — подкомпонент один, папку не создавать).
- `formatLibraryDate.ts` (+ `formatLibraryDate.test.ts`) — `Intl.DateTimeFormat(locale, { dateStyle: 'medium' })`; общего форматтера дат в `shared` нет, выносить рано (один потребитель).
- `index.ts` — экспорт `LibraryQuiz`.
- `libraryQuiz.nuxt.test.ts`.

**widgets/library-browser:**
- `libraryBrowser.nuxt.test.ts` — у виджета тестов нет: новый файл (рендер плиток со ссылками на карточку; пустой список; ошибка и «Повторить»; «Показать ещё»). Минимум — то, что меняется в шаге 10 (ссылки); остальное по желанию, не блокирует.

**entities/library:**
- `libraryApi.nuxt.test.ts` — по образцу `playApi.nuxt.test.ts`.

**features/take-library-quiz:**
- `TakeLibraryQuizButton.vue` — главный компонент: кнопка (`AppButton`, оранжевая — главное действие), текстовые статусы под кнопкой (`role="status"`/`role="alert"`); отдельной «Повторить» нет — повторное нажатие кнопки и есть повтор.
- `useTakeLibraryQuiz.ts` — состояния и защита от двойного клика.
- `types.ts` — `TakeStatus`, если нужен и компоненту, и composable.
- `takeLibraryQuiz.nuxt.test.ts` — composable и компонент.
- `index.ts` — экспорт `TakeLibraryQuizButton` и типов.
- Store НЕ нужен: состояние в одном компоненте, не переживает навигацию.

**e2e:**
- `apps/web/tests/e2e/library.spec.ts` — Playwright, `/api/**` перехватывается.

## Контракты

### entities/library
- `libraryApi.get(number: number): Promise<LibraryQuizResponse>` — `GET /library/${number}`, схема `libraryQuizResponseSchema`, без токена.
- `libraryApi.take(number: number, accessToken: string): Promise<LibraryTakeResponse>` — `POST /library/${number}/take`, без тела, схема `libraryTakeResponseSchema`, `accessToken`; при принятом вопросе 7 — с увеличенным `timeoutMs`. Маршрут API тело не читает.
- Типы: `LibraryQuizResponse`, `LibraryQuizDetails = LibraryQuizResponse['quiz']`, `LibraryTakeResponse` (реэкспорт из shared).

### widgets/library-quiz
- `LibraryQuiz` props: `{ number: number }`; emits: `not-found`.
- Внутри (виджету можно `@/features/auth`): `useAuthStore()`, `restoreSession()` на mount, `authorizedRequest`, `navigateTo`, `useLocalePath`, `useUnroutedPath`, `useRoute`. Формирует:
  - `isSignedIn = computed(() => auth.isAuthenticated)`, `isSessionChecked` (ref; true после `await restoreSession()` с `finally`);
  - `take = () => authorizedRequest((token) => libraryApi.take(number, token))` — передаётся в фичу;
  - `onLoginRequired`: `navigateTo({ path: localePath(AUTH_PATHS.login), query: { next: route.fullPath } })` (как в `teacher-auth.ts`);
  - `onTaken(quizId)`: `navigateTo(localePath(`${TEACHER_PATHS.quizEdit}/${quizId}`))` (см. «Куда ведёт успех»).

### features/take-library-quiz
`TakeLibraryQuizButton` props:
- `isSignedIn: boolean` — вошёл ли учитель (из виджета);
- `isReady: boolean` — сессия проверена (пока `false` — кнопка disabled);
- `take: () => Promise<{ quizId: string }>` — копирование (виджет подставляет `authorizedRequest` + `libraryApi.take`; фича не импортирует features/auth).

emits: `taken` (payload `quizId: string`); `login-required` (гость нажал кнопку, либо `take` вернул 401).

`useTakeLibraryQuiz({ isSignedIn, take, onTaken, onLoginRequired })` → `{ status, isBusy, run }`, `TakeStatus = 'idle' | 'taking' | 'taken' | 'limit' | 'storage' | 'busy' | 'notFound' | 'network' | 'failed'`.

## Поток данных и состояния

### Карточка (шаг 10)
1. `/library/quiz/12-stolitsy` → `app/pages/library/quiz/[slug].vue` → `LibraryQuizPage(slug)`.
2. `parseQuizSlug(slug)`: `null` (мусор, `0`, `abc`) → 404 без запроса к API; хвост после номера не сравнивается с названием (301 — шаг 13). Главный — номер.
3. `LibraryQuiz` на mount: `loadGroups()` (кэш `useState`) и `load()`.
   - loading → «Загрузка…» (`role="status"`);
   - ready → карточка;
   - 404 → `not-found` → страница вызывает `showError` с 404 → `error.vue` → `ErrorPage`; одинаково для несуществующего, удалённого, скрытого, непубличного;
   - другая ошибка (сеть, 429, 5xx, невалидный ответ) → `library.loadError` + «Повторить».
4. Превью: `quiz.questions` как пришло (API отдаёт первые `LIBRARY_PREVIEW_QUESTIONS`); при `questionCount > questions.length` — строка «Показаны первые {shown} из {total}. Остальные вопросы и правильные ответы вы увидите в своей копии». Правильные ответы в разметке не рендерятся.
5. Группа: `groupName(slug)` из `useLibraryGroups`; если списка нет — группа в мете не показывается.
6. Список (`LibraryBrowser`): название — `NuxtLink`; кликабельная область растянута на плитку (псевдоэлемент), touch-target ≥ 44px; вложенных интерактивных элементов нет.

### «Взять себе» (шаг 11)
| Состояние | Поведение |
| --- | --- |
| Сессия ещё не проверена (`isReady = false`) | кнопка disabled; включается после `restoreSession()`. При сетевой ошибке refresh статус остаётся `'unknown'` → считаем гостем (кнопка включается, ведёт на вход), не зависает |
| Гость | подпись «Войдите, чтобы взять задание себе — оно появится в «Моих заданиях»». Клик → `login-required` → вход с `next` = адрес карточки. После email-входа `LoginPage` возвращает на карточку, дальше вошедший нажимает кнопку сам |
| Вошедший, клик | `taking`: кнопка disabled, подпись «Копируем…» (`role="status"`); `take()` |
| Двойной клик | `run()` сразу возвращается при `taking`/`taken` (флаг ставится синхронно до первого `await`); `disabled` в разметке — вторая линия. Повторное нажатие возможно только после ошибки |
| 201 | `taken` (кнопка остаётся disabled, «Готово! Открываем копию…»), `emit('taken', quizId)`, виджет делает `navigateTo` |
| 401 (сессия потеряна) | `idle`, `emit('login-required')` |
| 404 | «Это задание уже удалено или скрыто и больше недоступно»; кнопка disabled, ссылка «К разделам библиотеки» |
| 409 | «Достигнут лимит: не больше {max} заданий. Удалите ненужные в «Моих заданиях» и попробуйте снова» (`max = MAX_QUIZZES_PER_TEACHER`) + ссылка в «Мои задания» |
| 503 | «Не получилось скопировать картинки: хранилище временно недоступно. Попробуйте через несколько минут»; кнопка активна |
| 429 | «Слишком много попыток. Подождите немного и нажмите ещё раз»; без секунд |
| Сеть/таймаут (`status === 0`) | «Нет связи с сервером. Проверьте интернет и нажмите ещё раз. Если задание уже скопировалось, оно в «Моих заданиях»» |
| Остальное | «Не получилось взять задание. Попробуйте ещё раз» |

## Куда ведёт успех «Взять себе» — рекомендация: редактор копии `/teacher/quiz/<id>`
- Результат виден сразу и однозначно: учитель попадает ровно на созданную копию. В списке без отдельного сообщения (нужно состояние между страницами) новая карточка легко теряется среди до 100 заданий (хотя она первая из-за `createdAt desc`).
- В редакторе учитель впервые видит правильные ответы — ценность действия, которой нет в публичной карточке.
- Лишних механизмов нет: id есть в ответе, `teacher-auth` работает, из редактора есть возврат к заданиям.
- Побочных изменений нет: редактор автосохраняет только по действиям учителя; копия приватна (`isPublic = false`).
Альтернатива — `/teacher` с сообщением: ближе к формулировке критерия «копия в «Мои задания»», но нужно состояние между страницами.

## i18n-ключи (ru/en/de/fr, паритет; после правки локалей перезапустить контейнер `web`)
Переиспользуются: `library.title`, `library.questions`, `library.graded`, `library.notGraded`, `library.loading`, `library.loadError`, `library.retry`, `library.allGroups`.
Новые `library.quiz.*`: `backToGroup`, `addedOn` («Добавлено {date}»), `previewTitle`, `questionNumber` («Вопрос {n}»), `previewNote` ({shown}, {total}), `noQuestions`.
Новые `library.take.*`: `button` («Взять себе»), `taking`, `taken`, `loginHint`, `errors.limit` ({max}), `errors.storage`, `errors.busy`, `errors.network`, `errors.notFound`, `errors.failed`, `toMyActivities`, `toLibrary`.
Тексты de/fr — рабочие, как у групп; показать носителю до запуска. Названия групп — из API.

## Тесты и критерии «готово»

### Шаг 10 (карточка)
- `libraryApi.nuxt.test.ts`: `get` обращается к `/library/12`, разбирает схемой; 404 → `ApiError(404)`.
- `formatLibraryDate.test.ts` (unit): локали ru/en/de/fr, невалидная дата не падает.
- `libraryQuiz.nuxt.test.ts`: название, группа, число вопросов, дата, «с оценкой/без оценки», вопросы и варианты; в DOM нет слов о правильных ответах; примечание «первые N из M» только при `questionCount > questions.length`; картинки с `alt=""`; 404 → `not-found`; сеть/429/5xx → сообщение и «Повторить» (повтор грузит заново); HTML-подобный текст в названии/вопросе выводится текстом (проверка `wrapper.html()` на экранирование).
- Страница: slug `abc`/`0`/`-5` → 404 без вызова `libraryApi.get`.
- ОБЯЗАТЕЛЬНАЯ проверка 404: тест, который вызывает `showError` с 404 в окружении nuxt и убеждается, что `app/error.vue` показывает именно «не найдено» (а не текст серверной ошибки). `ErrorPage` читает `error.status`; `showError({ statusCode: 404 })` может не заполнить `status` в используемой версии Nuxt — при расхождении передавать `status: 404` (или оба поля). Это реализатор проверяет на шаге 5, фиксируя результат тестом.
- `libraryBrowser.nuxt.test.ts`: заголовок плитки — ссылка `/library/quiz/<n>-<slug>` (для en — `/en/library/quiz/...`).
- Playwright: `/library/<группа>` → клик по плитке → карточка (мок `GET /api/library/12`); 404 от API → страница 404 с кодом; нет горизонтального скролла на 360 px (образец `horizontalScroll.spec.ts`).
- Критерий «готово»: открывается карточка по ссылке из списка и по прямому адресу (в том числе с кириллическим slug); правильных ответов нет в DOM и сетевом ответе; удалённое/скрытое/несуществующее → страница 404; lint (нет deep imports), typecheck, vitest web зелёные; паритет локалей.

### Шаг 11 («Взять себе»)
- `takeLibraryQuiz.nuxt.test.ts` (composable и компонент, `take` — `vi.fn()`): гость → `login-required`, `take` не вызван; вошедший → один вызов, `taken` с `quizId`; два `run()` подряд без await → `take` вызван один раз, после ошибки повтор допустим; 401 → `login-required`; 404/409/503/429/0/500 → свой статус и текст в `role="alert"`; текст 409 содержит `MAX_QUIZZES_PER_TEACHER`; `isReady = false` → кнопка disabled.
- Виджет (`libraryQuiz.nuxt.test.ts`, дополнить): гость → `navigateTo` на вход с `query.next` = адрес карточки (в том числе `/en/...` и кириллический slug); вошедший (`setSession`) + мок `libraryApi.take` → вызван с `(12, 'access-1')`, затем `navigateTo('/teacher/quiz/<id>')`; 401 после refresh → вход.
- `redirect.test.ts`: добавить кейсы `/library/quiz/12-слово` и `/en/library/quiz/12-x`, если их нет; сам `safeNextPath` не менять.
- Playwright: гость → «Взять себе» → вход с `?next=` → email-вход (мок) → возврат на карточку; вошедший (мок refresh, образец `teacherMenu.spec.ts`) → клик → `POST /api/library/12/take` → `/teacher/quiz/<id>`; 409 и 503 → видимые тексты; два быстрых клика → ровно один `POST`.
- Критерий «готово»: гость → вход с `next` → возврат на карточку; вошедший → копия и переход к ней; 409 и 503 — понятные тексты; двойной клик не создаёт две копии; lint/typecheck/vitest зелёные.

## Порядок работ (мелкие шаги; после каждого — lint, typecheck, vitest затронутого)
1. `entities/library`: `get`, `take`, типы, экспорт + `libraryApi.nuxt.test.ts`. [small]
2. i18n: `library.quiz.*` в 4 локалях, паритет, перезапуск `web`. [small]
3. `widgets/library-quiz`: `formatLibraryDate` + тест, `useLibraryQuiz`, `LibraryQuizQuestion`, `LibraryQuiz` (без кнопки) + `libraryQuiz.nuxt.test.ts`. Вёрстка — через `ui-designer` (только мобильная, BEM, `rgb(var(--x) / a)`, образец `library-browser`). [medium]
4. `LibraryQuizPage.vue` + `app/pages/library/quiz/[slug].vue`, разбор slug, `showError` и тест, что показывается 404 (см. выше). Ручная проверка в браузере: валидный адрес, мусорный, удалённое. [small]
5. Ссылки из `LibraryBrowser` + `libraryBrowser.nuxt.test.ts`. [small]
6. Playwright `library.spec.ts` (шаг 10). Конец шага 10 — ЧЕКПОИНТ. [medium]
7. i18n `library.take.*` в 4 локалях. [small]
8. (если принят вопрос 7) `timeoutMs` в `apiClient` + тест, `libraryApi.take` использует его. [small]
9. `features/take-library-quiz`: `useTakeLibraryQuiz` + тест (все статусы, двойной клик). [medium]
10. `TakeLibraryQuizButton.vue` (+ `types.ts`, `index.ts`) + тест компонента, вёрстка через `ui-designer`. [medium]
11. Интеграция в `LibraryQuiz`: `isSignedIn`/`isReady`, `take`, `onLoginRequired`, `onTaken` + тесты виджета. [small]
12. Playwright: сценарии шага 11. [medium]
13. `tester` → `code-reviewer`; обновить отметки в `library.md`. [small]

## Git checkpoint и затрагиваемые публичные контракты
Предложить пользователю checkpoint (коммит и `git add` делает только он):
- ПЕРЕД шагом 1: меняется публичный API `entities/library` (`index.ts`) и общий i18n, затрагивается 3+ файла.
- После шага 6 (конец шага 10): 12+ файлов (entities, widget, page, app route, 4 локали, e2e).
- ПЕРЕД шагом 8 (если принят вопрос 7): правка общего `apiClient` — им пользуются все запросы web, нужен отдельный checkpoint и прогон всех nuxt-тестов.
- После шага 12 (конец шага 11): новая фича, интеграция в виджет, 4 локали.
Публичные контракты: экспорты `entities/library/index.ts` (добавляются, существующие не меняются); `widgets/library-browser` — разметка, пропсы и экспорты те же; `packages/shared` не меняется. `features/auth`, `quiz-editor`, Нат (`shared/nat`) — НЕ меняются. Новых зависимостей нет.

## Risks & Edge Cases
- Таймаут 15 с против долгого `take` (вопрос 7): копия создаётся, а пользователь видит ошибку и жмёт повторно — дубль и расход лимита 100. Текст ошибки сети лишь смягчает.
- Копия при потерянном ответе по любой причине (обрыв сети): вторая копия возможна; идемпотентность — изменение API, вне объёма.
- Лимит 100 расходуют и копии: пользователь с 100 заданиями получит 409; текст ведёт в «Мои задания».
- `?next` теряется при Google-входе и после регистрации (подтверждено по `GoogleCallbackPage`, `VerifyEmailPage`, `RegisterPage`): гость окажется в `/teacher`. Не блокирует; вопрос 3.
- Адрес карточки с кириллическим slug: `route.fullPath` приходит percent-encoded; `safeNextPath` пропускает; покрыть тестом. `route.params.slug` vue-router декодирует; `parseQuizSlug` обрабатывает любой хвост.
- Пользовательский контент (название, вопросы, варианты): только `{{ }}`, никакого `v-html`; длинные слова — `overflow-wrap: anywhere`.
- Картинки из бакета: `img-src` в CSP уже в требованиях деплоя картинок; `loading="lazy"`, битые скрываются по `@error`; `alt=""` как на странице игры.
- Статус сессии `'unknown'` при сетевой ошибке refresh: кнопка не должна зависать — включается как для гостя.
- Две вкладки: выход в соседней вкладке между кликами → 401 → ветка «войти снова», копия не создаётся.
- Правильные ответы: ни в типах, ни в DOM, ни в фикстурах карточки (схема ответа их не содержит); проверить в code-review.
- Результаты и данные учеников не появляются; данных автора в публичных ответах нет.
- 429 на карточке (120/мин на IP, школьный NAT) показывается как `loadError` + «Повторить»; отдельный текст не нужен.
- `showError` и `error.status` (см. тест 404): без проверки возможен текст «серверная ошибка» вместо «не найдено».
- Dev: после правки локалей перезапустить контейнер `web` (нет HMR локалей).

## Open Questions (решение пользователя; моя рекомендация — первая)
1. Куда вести после успешного «Взять себе»? Рекомендую редактор копии `/teacher/quiz/<id>` (результат виден сразу, учитель видит правильные ответы; возврат к «Моим заданиям» есть в редакторе). Альтернатива — `/teacher` с сообщением «Задание добавлено» (ближе к формулировке критерия, но нужно состояние между страницами).
2. После возврата гостя на карточку по `next` — брать задание автоматически или ждать второго клика? Рекомендую второй клик: явное действие, нет неожиданных копий и расхода лимита.
3. `next` не работает при входе через Google и после регистрации. Рекомендую принять ограничение сейчас (email-вход — основной сценарий) и записать в известные ограничения; расширение `GoogleCallbackPage`/`VerifyEmailPage`/регистрации — отдельный небольшой шаг по `auth`.
4. Гостю показывать ту же кнопку «Взять себе» с подсказкой «Войдите, чтобы…» (рекомендую: одно действие, понятная подсказка) или кнопку «Войти и взять себе»?
5. 404 карточки: полноэкранная страница ошибки через `showError` (рекомендую: это «страница 404» по решению, единый вид) или инлайн-сообщение как у группы? Инлайн проще и не зависит от `error.status`, но вид отличается от остальных 404.
6. Сообщение при сетевой ошибке с подсказкой «если задание уже скопировалось, оно в «Моих заданиях»»: оставить (рекомендую, честно описывает риск) или убрать как тревожащее?
7. Таймаут 15 с для `take`: добавить в `apiClient` необязательную опцию `timeoutMs` и вызывать `take` с 60 с (рекомендую: это аддитивная правка, остальные запросы не меняются; без неё большое задание с картинками может «падать» на клиенте при успехе на сервере и плодить копии). Проверить заодно, что Caddy и сервер API не обрывают такой запрос раньше (в этом плане не исследовалось — это вопрос деплоя). Альтернатива — не менять и принять риск для заданий с очень большим числом картинок.
