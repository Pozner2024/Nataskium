# План: публичная библиотека заданий

## Цель
Задания учителей автоматически попадают в публичную SEO-библиотеку, разбитую на группы; учитель копирует задание себе кнопкой «Взять себе», ученикам напрямую из библиотеки ничего не отправляется.

## Принятые решения (не пересматриваются)
Автопубликация при создании без предупреждений, в том числе заданий с оценкой. Скрыть задание можно только на платном тарифе (пока не может никто). **Один уровень: только группы, без предметов**; группу выбирает учитель в настройках редактора. «Взять себе» копирует. Публичные адреса индексируются и имеют canonical; `/play/<shareToken>` остаётся случайным и noindex. Модерация позже (здесь только заготовка). Результаты учеников не сохраняются.
Решения пользователя от 2026-11-15:
- Существующие задания в БД при миграции публикуются (`is_public = true`), номера присваиваются.
- Копии от «Взять себе» в библиотеку автоматически НЕ попадают (`is_public = false` при копировании; системное исключение из автопубликации).
- Удаление задания учителем у себя убирает его из библиотеки (это одна и та же запись); копии других учителей не затрагиваются.

## Что найдено в коде (опорные факты)
- `quizzes`: `teacherId` (CASCADE), `shareToken`, `questions` jsonb, `deletedAt`, `@@index([teacherId, deletedAt])`. Репозиторий `makeQuizRepository(prisma: TransactionClient)`, use-cases create/update одним файлом, транзакция `QuizTransaction` (quiz + привязка картинок).
- `quizInputSchema` строгий (`.strict()`); образец «новое поле с default» — `imageId` (`optionalImageIdSchema`, данные шага 1 без него считаются валидными). `quizResponseSchema` расширяет `quizInputSchema`, поэтому поле появится в ответе автоматически.
- Картинки: файл `quiz-images/<uuid>.webp`, строка `quiz_images` создаётся после записи файла; инвариант «одна картинка — одно место»; порт `ImageStorage` имеет только `put/remove/listObjects/publicUrl` (нет `copy`/`get`). Удаление аккаунта удаляет строки каскадом и файлы по id учителя.
- Rate limit: `createRateLimiter` + `makeClientIpResolver`, лимиты в `features/<имя>/limits.ts`, ключ — IP (адрес сокета или `X-Real-IP` только от `TRUSTED_PROXY_IPS`).
- Web: `apiClient` ходит на относительный `/api` (браузерный `fetch` с `credentials: include`) — на сервере Nuxt он не работает; SSR-вызовов к API сейчас нет вообще. Вкладка `/teacher/library` существует как заглушка (`TeacherLibraryPage.vue`, noindex, CLIENT_ONLY). i18n: `prefix_except_default`, ru/en/de/fr. Редактор автосохраняется по каждому изменению настройки (`QuizSettings.vue` → `store.save()`).
- Шаблон «пути страниц в shared»: `packages/shared/routes/teacherPages.ts`.

## Модель данных (Prisma) — ВЫСОКИЙ РИСК, одна миграция `create_library`

**Группы — данные, не enum.**
- `library_groups`: `slug` (PK, text), `sort_order` int (уникальный), `names` jsonb `{ru,en,de,fr}`. Таблицы предметов нет.
- CHECK (вручную в миграции, как уже сделано для quizzes): `names ?& array['ru','en','de','fr']` и все значения непустые; slug по регэкспу `^[a-z][a-z0-9-]{1,39}$`; зарезервированный slug `quiz` запрещён (занят адресом карточки).
- Стартовый набор (вставка в миграции, порядок = `sort_order`):

| # | slug | ru | en | de | fr |
|---|------|----|----|----|----|
| 1 | `exact` | Точные науки | Mathematics & Sciences | Mathematik und exakte Wissenschaften | Mathématiques et sciences exactes |
| 2 | `it` | Информатика и технологии | Computer Science & Technology | Informatik und Technologie | Informatique et technologies |
| 3 | `natural` | Естественные науки | Natural Sciences | Naturwissenschaften | Sciences naturelles |
| 4 | `languages` | Языки и литература | Languages & Literature | Sprachen und Literatur | Langues et littérature |
| 5 | `humanities` | Гуманитарные науки | Humanities | Geisteswissenschaften | Sciences humaines |
| 6 | `arts` | Искусство и творчество | Arts & Creativity | Kunst und Kreativität | Arts et créativité |
| 7 | `health` | Спорт и здоровье | Health & Physical Education | Sport und Gesundheit | Sport et santé |
| 8 | `vocational` | Профессиональное обучение | Vocational Education | Berufsbildung | Formation professionnelle |
| 9 | `primary` | Начальная школа | Primary School | Grundschule | École primaire |
| 10 | `other` | Разное | Other | Sonstiges | Divers |

  `other` обязательна, значение по умолчанию, последняя по порядку. Переводы de/fr предложены мной, их стоит показать носителю или оставить как рабочие до запуска. Новая группа или смена порядка — INSERT/UPDATE в новой миграции (до первого деплоя можно править seed), код не меняется; при вставке новой группы перед `other` `sort_order` задаётся с зазором (шаг 10, 20, …) либо пересчитывается в той же миграции.
- Названия живут в БД (jsonb на 4 языка), а не в файлах переводов web: новая группа не требует релиза фронтенда. Zod-схема `localizedNamesSchema` строится из `SUPPORTED_LOCALES`, поэтому добавление нового языка заставит дополнить данные (интеграционный тест проверяет, что у всех строк есть все языки). Фолбэк на фронте: текущий язык → `DEFAULT_LOCALE` → slug.

**Поля `quizzes`:**
- `group_slug` text NOT NULL DEFAULT `'other'`, FK → `library_groups` (ON UPDATE CASCADE, ON DELETE RESTRICT), `@@index([groupSlug, createdAt desc])` (явный индекс на FK по правилам проекта).
- `is_public` boolean NOT NULL DEFAULT true. Видимость в библиотеке = `is_public` И `deleted_at IS NULL` И `moderation_hidden_at IS NULL`. Удаление задания учителем (soft delete `deletedAt`) автоматически убирает его из библиотеки — отдельной записи библиотеки нет.
- `public_number` int UNIQUE `@default(autoincrement())` — публичный номер для адреса. НЕ связан с `shareToken` и uuid. Последовательный номер допустим, потому что открывает только публичные данные; непубличные/скрытые/удалённые/несуществующие дают одинаковый 404.
- `moderation_hidden_at` timestamptz NULL — заготовка модерации (**вне объёма**): в библиотеке скрывает, но ничего пока не ставит. Роль суперадмина (`Teacher.role`, 2FA, журнал) — отдельный шаг с админкой, в этот план не входит; пометка в `docs/architecture.md` уже есть.
- Частичный индекс (WHERE is_public AND …) не делаем: Prisma `migrate dev` считает такие индексы дрейфом и предлагает их удалить. Обычные индексы достаточны; частичный — после замера.
- Существующие строки (решение пользователя): `group_slug='other'`, `is_public=true` — публикуются все; номера проставляются автоматически.
- Откат: у Prisma нет down-миграций; перед применением — бэкап; ручной скрипт отката (DROP колонок и таблицы) хранится в описании миграции. `prisma migrate diff` после применения должен быть пустым. Контейнер api миграции сам не применяет.
- Платный тариф: Prisma-полей про тариф сейчас нет. Заводится порт `PublicationPolicy.canKeepPrivate(teacherId): Promise<boolean>` в `features/quizzes`, в `app.ts` подключена заглушка «всегда false». Create всегда пишет `is_public=true`. Когда появится PayPal, реализация читает тариф учителя, добавляется `PUT /api/quizzes/:id/publication`, использующий политику — без переделки модели. Сейчас этот маршрут не создаём (нет UI, лишняя поверхность).

## Zod и shared (`packages/shared`)
Новые файлы:
- `schemas/library.ts`: `groupSlugSchema`, `DEFAULT_GROUP_SLUG = 'other'`, `localizedNamesSchema`, `libraryGroupsResponseSchema` (список групп `{slug, names}` по порядку), `libraryListQuerySchema` (`group?`, `q?` trim 2..60, `page` int 1..200 coerce; фиксированный `LIBRARY_PAGE_SIZE`), `libraryQuizSummarySchema`, `libraryListResponseSchema`, `libraryQuizResponseSchema`, `libraryTakeResponseSchema` (`{ quizId }`), `librarySitemapResponseSchema`, `libraryNumberSchema`.
- `library/slug.ts`: чистая `slugifyTitle` (Unicode-буквы и цифры в нижнем регистре через дефис, до 60 знаков, пустой → `quiz`) и разбор `<number>-<slug>`. Slug не хранится: при смене названия он устарел бы; номер главный, неверный slug → 301 на актуальный адрес.
- `routes/libraryPages.ts`: построители путей `/library`, `/library/<group>`, `/library/quiz/<n>-<slug>` (по образцу `teacherPages.ts`).
Изменяется:
- `schemas/quiz.ts`: `quizInputSchema` получает `group: groupSlugSchema.default('other')`. `default` сохраняет совместимость со старыми клиентами и тестами. Потребители: `apps/api` (`quizRepository` select/create/update, `toStoredQuiz`, `StoredQuiz`, `quizRoutes` list/response), web (`entities/quiz` types/`newQuestion`, `quiz-editor` store, `QuizSettings`), тесты `quiz.test.ts`, `quizEditor.nuxt.test.ts`, интеграционные.
- `schemas/index.ts` — экспорт.

**Публичный ответ (явный `select` и явная сборка, как в `getPlayQuiz`):** `number`, `title`, `groupSlug`, `questionCount`, `graded: boolean` (не шкала), `createdAt` (дата), в карточке — первые N вопросов (текст, тексты вариантов, картинки) **без `isCorrect`, без `selectCount`**. Никогда: `id` (uuid), `teacherId`, `shareToken`, email/`displayName`, `updatedAt`/`version`. Тест фиксирует точный набор ключей ответа. Правильные ответы учитель получает после «Взять себе» (допущение, не блокирует).

## Backend (`apps/api/src/features/library/`)
Один файл на операцию, `make…`-фабрики, Prisma только в infrastructure.
- `infrastructure/groupRepository.ts` (`makeLibraryGroupRepository`): список групп по `sort_order`, `exists(slug)`.
- `infrastructure/libraryRepository.ts`: `list({group, q, page})`, `findByNumber`, `findForCopy(number)` (с `questions`), `sitemapPage(cursor)`. Условие публичности — общая константа `PUBLIC_WHERE` (`isPublic`, `deletedAt null`, `moderationHiddenAt null`). Поиск по `title` через `contains` + `mode: insensitive` (Prisma экранирует `%`/`_`); индекс триграмм не добавляем без замера. Сортировка `createdAt desc, id desc`. Пагинация по страницам с потолком (`page ≤ 200`).
- `application/listLibraryGroups.ts`, `listLibraryQuizzes.ts`, `getLibraryQuiz.ts`, `takeLibraryQuiz.ts`, `listSitemapEntries.ts`.
- `presentation/libraryRoutes.ts`, `limits.ts` (`LIBRARY_LIMITS`), `index.ts`.
- Маршруты (`/api/library`):
  - `GET /groups` — список групп (публично)
  - `GET /` — список с `group`, `q`, `page` (публично)
  - `GET /:number` — карточка (публично)
  - `GET /sitemap` — для sitemap (публично)
  - `POST /:number/take` — Bearer (`requireAuth`), возвращает 201 `{ quizId }`
- Невалидные query/param → 400 через Zod (`safeParse`, не 500). Неизвестная группа/номер/скрытое/удалённое/непубличное — одинаковый 404.
- Изменения в `features/quizzes`: `create/update` проверяют `groups.exists(group)` до транзакции → новая ошибка `groupUnknown()` (400, общий текст); create ставит `isPublic: true` явно; репозиторий пишет/читает `group`. Update не трогает `isPublic`; `deleteQuiz` не меняется (soft delete и так убирает из библиотеки).
- `app.ts` (composition root): подключает `makeLibraryRepository`, `makeLibraryGroupRepository`, use-cases, роутер, лимиты, `PublicationPolicy`-заглушку. Тела запросов: стандартные 100 КБ.

### «Взять себе» (`takeLibraryQuiz.ts`)
1. Найти публичное задание по номеру (иначе 404); провалидировать `quizInputSchema` (рассинхрон → 500, как в `toStoredQuiz`).
2. Лимит `MAX_QUIZZES_PER_TEACHER` (счёт учитывает копии) → 409.
3. Картинки **копируются, а не делятся**: общие `imageId` нарушили бы инвариант «одна картинка — одно место», а удаление аккаунта автора удалило бы файлы у тех, кто взял копию (GDPR-удаление файлов идёт по id учителя). Порт `ImageStorage` получает метод `copy(fromKey, toKey)` (серверный S3 `CopyObject` в том же бакете, без скачивания; ключи проверяются шаблоном как у остальных; реализация S3 + `tests/fakes/memoryImageStorage.ts`). Для каждой картинки: новый `randomUUID`, копия файла, затем `INSERT quiz_images` (строка появляется только после файла — существующее правило), потом `imageId` в вопросах заменяются картой старый→новый.
4. Порядок: файлы копируются до транзакции (конкурентность 4–5, чтобы не открывать до ~350 запросов разом) → транзакция `QuizTransaction`: create quiz (новый `shareToken`, как в `createQuiz`) + `images.create` + `syncQuizImages`. Сбой на любом шаге — best-effort `remove` уже скопированных файлов; недочищенное подбирает суточная сверка (`IMAGE_STORAGE_RECONCILE`, файлы старше суток без строки). Сбой хранилища → `ExternalServiceError`/503 без ключей и адресов; хранилище не настроено, а у задания есть картинки → 503 как `imageStorageUnavailable`; отсутствующий исходный файл → тоже ошибка, а не «задание без картинки» (вариант без текста и картинки невалиден).
5. Копия (решение пользователя): `isPublic = false` — системное исключение из автопубликации, а не выбор учителя; та же `group`, `title`, `showAnswers`, `gradingScale`; связи с источником в БД нет, поэтому удаление источника (soft delete или аккаунта автора) копию не затрагивает.
6. Зависимости use-case — порты из `library/types.ts` (репозиторий, `countByTeacher`, транзакция, копировщик картинок); связывание только в `app.ts`.

### Лимиты и безопасность публичных эндпоинтов
- Только лимиты по IP через существующий `createRateLimiter`, `maxTrackedKeys`; предложение (числа мягкие, школы за NAT): список групп — 120/мин, список — 120/мин, поиск (`q` задан) — отдельный 30/мин, карточка — 120/мин, sitemap — 30/мин; `take` — на учителя и на IP (например 30/час и 60/час), так как копирование дорогое (S3).
- Не подключать `logger()` из Hono; `q` и номера в лог не писать.
- Поиск — только по `title`, параметризован Prisma, длина 2..60; нет раскрытия того, чего нет в карточке.
- Контент публичный и пользовательский: никакого `v-html`, вывод только текстом; картинки — из бакета по случайным id.
- Одна реплика api (in-memory лимитер) — без изменений.
- **Риск SSR и лимитов:** запросы Nuxt-сервера к API идут с одного IP контейнера web, и лимит по IP ударит по всем посетителям сразу. Решение: Nuxt при SSR пробрасывает в API только `X-Real-IP` (его ставит Caddy), а статический IP контейнера web добавляется в `TRUSTED_PROXY_IPS`; куки и `Authorization` не пробрасываются. Плюс `swr`-кэш на страницах уменьшает число запросов к API. Требует проверки при деплое (Caddy перезаписывает `X-Real-IP` и для запросов к Nuxt, порт web наружу не публикуется).
- Правила из аудита (`security-audit-future-requirements`): ZodError → 400, `shareToken` не выдавать (в публичном ответе его нет), `bodyLimit`, явный `select`, `Retry-After` — уже поддерживается `RateLimitedError` (проверить, что `errorHandler` его отдаёт на новых маршрутах).

## Frontend (FSD)
Store не нужен нигде: данные страниц — `useAsyncData`/локальное состояние, список групп — один composable поверх `useState` (общий для редактора и библиотеки, живёт при навигации), без `store.ts`.

- `entities/library/` (новый слайс): `libraryApi.ts` (groups, list, card, take, sitemap — ответы разбираются схемами shared), `types.ts`, `LibraryQuizCard.vue` (карточка в списке), `useLibraryGroups.ts`, хелпер `localizedName(names, locale)`, `index.ts`.
- `entities/quiz`: тип и поле `group` в типах/`newQuestion`.
- `shared/api/apiClient.ts`: поддержка SSR — база адреса на сервере берётся из `runtimeConfig` (`API_INTERNAL_BASE`, приватная, например `http://api:3000/api`), не из `/api`; на сервере пробрасывается только `X-Real-IP`; без `credentials`. Это изменение общего клиента: покрыть тестами, браузерное поведение не менять.
- `features/take-library-quiz/`: кнопка «Взять себе» + `useTakeLibraryQuiz` (состояния, 409 лимит, 503, ошибки сети). Знание «вошёл ли учитель» получает через prop из виджета (features не импортируют соседние features). Гость → переход на вход с `?next=<адрес карточки>`; успех → в «Мои задания»/редактор.
- `widgets/library-browser/`: чипы групп (по `sort_order`, первым «Все»), поле поиска, сетка карточек, пагинация ссылками. Режим `public` (фильтр в пути, ссылки на публичные карточки) и `cabinet` (фильтр в query, внутри `/teacher/library`).
- `widgets/library-quiz/`: страница-карточка: название, группа, число вопросов, первые вопросы, кнопка «Взять себе» (с `signedIn` из `@/features/auth`).
- `widgets/quiz-editor/components/GroupSelect.vue` внутри `QuizSettings.vue`: нативный `<select>` без `<optgroup>`, автосохранение через `store.save()` как у остальных настроек, откат при ошибке. Недоступность списка групп — поле скрыто, остаётся `other`.
- Страницы `src/pages/LibraryPage.vue` (`/library` и `/library/:group` — один компонент по параметру), `LibraryQuizPage.vue`; тонкие `app/pages/library/index.vue`, `library/[group].vue`, `library/quiz/[slug].vue`. `TeacherLibraryPage.vue` заменяет заглушку (`noindex`, CSR остаётся). Slug `quiz` зарезервирован (проверка в CHECK).
- i18n: строки интерфейса `library.*` и `teacher.quizEditor.settings.group*` — во все четыре файла `ru/en/de/fr` (паритет); названия групп — из API.
- Вёрстка только мобильная ([[mobile-first-only]]), цвета/BEM по CLAUDE.md; `ui-designer` для UI; Нат не трогаем.

### SEO / SSR
- `nuxt.config.ts`: `/library` и `/library/**` (для каждого языкового префикса) — SSR с `swr` (например 10 минут); `/teacher/library` остаётся в `CLIENT_ONLY_PATHS`. Страницы поиска (`?q=`) и пагинации сверх первой — не кэшируются и получают `noindex,follow`.
- Для каждой публичной страницы: уникальные `title`/`description`, `canonical`, OG. Карточка: slug из заголовка; несовпадение slug → 301 (`navigateTo(..., { redirectCode: 301 })`). Языковые варианты `/en/library/...`: контент на языке автора, поэтому canonical карточки указывает на адрес без префикса (допущение; hreflang для карточек не ставим). Списки/группы — canonical на себя, hreflang между языковыми версиями.
- Sitemap: собственный Nitro-роут (`server/routes/sitemap.xml.ts` + нарезка по ~10 000 URL) поверх `GET /api/library/sitemap`; пакет `@nuxtjs/sitemap` не добавляем. `robots.txt`: Disallow `/play/`, `/teacher/`, `/auth/` (и версии с префиксами языков), `?q=`; строка `Sitemap:` требует абсолютного адреса сайта — нужна публичная переменная `SITE_URL` (проверить, есть ли).
- `/play/**` в Caddy добавить `X-Robots-Tag: noindex`: страница с `ssr: false` отдаёт пустую оболочку, мета-тег виден только после выполнения JS (задача деплоя, рядом с CSP/Caddyfile).
- Черновик публичен сразу после первого сохранения задания (следствие автопубликации): допускаем; в sitemap можно добавлять задания не моложе часа — по желанию.

## GDPR / удаление
- Опубликованные задания — обычные строки `quizzes` с `ON DELETE CASCADE`: при удалении аккаунта удаляются вместе с учителем, их страницы начинают отвечать 404, файлы картинок удаляются существующим сценарием. Копии, взятые другими, независимы (свои строки и свои файлы) — поэтому картинки копируются физически.
- Удаление задания учителем (soft delete) убирает его из библиотеки сразу; копии других учителей не затрагиваются.
- В API и публичных страницах нет сведений об авторе; в ответах нет `teacherId`.
- Остаточные следы: `swr`-кэш (до TTL), кэши поисковиков, браузерный кэш картинок (`immutable` на год). Принять и описать в политике.
- Юридически: политика конфиденциальности и условия должны сообщать, что задания публикуются (в интерфейсе предупреждений нет — решение пользователя, но документы обязаны это отражать). Не блокирует код, блокирует публичный запуск.

## Шаги (каждый проверяется отдельно)

### 1. Shared: схемы, slug, пути [medium]
Создать `schemas/library.ts`, `library/slug.ts`, `routes/libraryPages.ts`; добавить `group` с default в `quizInputSchema`; экспорты.
Критерий: unit-тесты shared (slug, парсинг номера, схемы, старые payload без `group` валидны, `localizedNamesSchema` требует все локали); `tsc` и тесты api/web не сломаны.

### 2. Миграция Prisma (ВЫСОКИЙ РИСК) [medium]
Схема + миграция `create_library` с seed десяти групп, CHECK, индексами; бэкап перед применением на любой общей БД; применить на dev и test.
Критерий: `migrate deploy` на тестовой БД; существующие викторины получили `other`, `is_public=true` и номера; все seed-строки содержат 4 языка, порядок 1–10, `other` последняя; `prisma migrate diff` пуст; `npm run test:integration` проходит.

### 3. API: группа у викторины и политика публикации [medium]
Репозиторий/use-cases create/update, `groupUnknown`, `PublicationPolicy`-заглушка, `isPublic: true` при создании, ответы list/get с `group`.
Критерий: тесты: создание с неизвестной группой → 400, без `group` → `other`, update меняет группу, чужие данные не затронуты; `isPublic` не меняется update-ом.

### 4. API: чтение библиотеки [large]
`features/library`: список групп, список (группа/поиск/страница), карточка, лимиты, wiring в `app.ts`.
Критерий: интеграционные тесты — новое задание публикуется; удалённое (`deletedAt`), `isPublic=false`, `moderation_hidden_at` не видны; одинаковый 404; точный набор ключей ответа без `shareToken`/`id`/`teacherId`/`isCorrect`; поиск экранирует `%` и `_`; фильтр по группе; 429 с `Retry-After`; 400 на мусорные параметры; soft delete учителем убирает из библиотеки.

### 5. Порт ImageStorage: `copy` [small]
Метод в порте, S3-реализация (CopyObject в том же бакете, тот же шаблон ключа, таймауты/попытки как у остальных), фейк в памяти.
Критерий: unit-тесты порта и фейка; ключи вне шаблона отклоняются; ошибка S3 не содержит ключей.

### 6. API: «Взять себе» [large]
`takeLibraryQuiz.ts`, маршрут, лимиты на учителя/IP.
Критерий: тесты — копия появляется у учителя с новым `shareToken` и `isPublic=false` (в библиотеке не видна); все `imageId` новые, строки `quiz_images` принадлежат взявшему и привязаны; файлы скопированы; лимит 100 → 409; чужое/скрытое/удалённое → 404; без токена → 401; сбой копирования откатывает и чистит файлы; удаление источника или аккаунта автора не ломает копию (картинки на месте); хранилище не настроено + картинки → 503.

### 7. API: sitemap-данные [small]
`GET /api/library/sitemap` с курсором (номер, дата изменения), лимит.
Критерий: возвращает только публичные; ответ без лишних полей; тест на пагинацию.

### 8. Web: основа (api-клиент для SSR, `entities/library`, i18n) [medium]
`runtimeConfig`, SSR-режим `apiClient` (пробрасывается только `X-Real-IP`), слайс `entities/library`, строки во все 4 локали.
Критерий: unit-тесты клиента (браузер — как раньше, сервер — абсолютный адрес и заголовок, без cookie/Authorization); lint без deep imports; паритет локалей.

### 9. Web: выбор группы в редакторе [small]
`GroupSelect.vue` в настройках, автосохранение, откат.
Критерий: тест редактора (`quizEditor.nuxt.test.ts`): выбор группы уходит в `PATCH` и возвращается; при ошибке откатывается; новое задание — «Разное».

### 10. Web: публичные страницы библиотеки + SEO [large]
Виджеты `library-browser`, `library-quiz`, страницы, `routeRules` с `swr`, meta/canonical, 301 по slug.
Критерий: HTML ответа сервера содержит заголовок и карточки (curl без JS); canonical и robots корректны; поиск `noindex`; удалённое/скрытое — 404 страница; фильтр по группе работает по URL; Playwright-сценарий.

### 11. Web: «Взять себе» и вкладка кабинета [medium]
Фича `take-library-quiz`, `TeacherLibraryPage` с `library-browser` в режиме cabinet.
Критерий: гость → вход с `?next=` и возврат на карточку; вошедший → копия в «Мои задания»; 409 и 503 показывают понятные тексты; двойной клик не создаёт две копии.

### 12. sitemap, robots, деплой-заметки, документация [medium]
Nitro-роуты `sitemap.xml`/`robots.txt`, `X-Robots-Tag` для `/play/**` и проброс `X-Real-IP` в Caddyfile/`TRUSTED_PROXY_IPS`, обновление `docs/architecture.md` (раздел «Библиотека», лимиты, SEO, миграция).
Критерий: `/sitemap.xml` перечисляет только публичные адреса; robots закрывает `/play/`, `/teacher/`, `/auth/`; за Caddy лимит считается по IP посетителя, а не контейнера web.

### 13. Итоговая проверка [small]
Tester → code-reviewer (по командной схеме), `npm audit` (новых зависимостей нет), чек-лист: нет `shareToken` и данных учителя в публичных ответах, GDPR-сценарий (удаление аккаунта убирает страницы и файлы).

## Риски и граничные случаи
- Необратимая миграция; все существующие задания становятся публичными (решение принято; для dev-данных безопасно, на реальных данных — сверить перед применением).
- Публичный контент детей/мусор до модерации; публичны тексты вопросов (правильные ответы в карточке не показываются, но попадают к любому, кто «взял себе»; ученик может зарегистрироваться как учитель — принято продуктом).
- Группы широкие: в «Точные науки» и «Языки и литература» со временем окажется много заданий — помогает поиск и пагинация; при необходимости позже добавится второй уровень отдельным решением.
- Нагрузка копирования картинок (до ~350 файлов на задание) — лимиты и ограниченный параллелизм.
- SSR и rate limit по IP контейнера web; кэш `swr` и ключи поиска.
- Расширение `ImageStorage` и общего `apiClient` затрагивает существующие тесты; изменения `quizInputSchema` затрагивают api и web.
- Не конфликтует с решением «результаты не сохраняются»: ничего о результатах и учениках не добавляется.

## Открытые вопросы
Блокирующих вопросов не осталось: публикация существующих заданий, непубликация копий и поведение при удалении закрыты решениями пользователя. Небольшие допущения, не блокирующие работу: тексты вопросов (без правильных ответов) показываются в карточке; canonical карточки — на адрес без языкового префикса; переводы de/fr названий групп предложены мной и могут быть уточнены носителем.
