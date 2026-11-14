# Викторина, шаг 2: картинки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Учитель добавляет картинку к вопросу и к вариантам (файл, drag & drop, Ctrl+V); сервер проверяет, уменьшает и хранит её в Яндекс Object Storage; картинки видны в редакторе и на странице задания.

**Architecture:** Загрузка — отдельный маршрут `POST /api/quiz-images` (multipart, Bearer): `sharp` декодирует, поворачивает, вписывает в 1200×1200 и кодирует в WebP; файл кладётся в хранилище через порт `ImageStorage` (S3 из NatsDoll; в dev — отдельный бакет Яндекса `nataskium-dev`; в тестах — память). Учёт — таблица `quiz_images` (владелец, привязка к викторине). В данных вопроса хранится только `imageId`; API строит публичный `imageUrl` в ответах. Очистка «осиротевших» файлов и сверка хранилища с таблицей — отдельным расписанием раз в сутки (`IMAGE_CLEANUP_INTERVAL_MS = 24 ч`) внутри процесса API, как очистка auth.

**Tech Stack:** Hono, Prisma 7, Zod 4, `sharp`, `@aws-sdk/client-s3`, `@smithy/node-http-handler`, Nuxt 4, Pinia, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-14-quiz-step2-images-design.md` (+ шаг 1: `docs/superpowers/specs/2026-11-13-quiz-step1-design.md`).

## Global Constraints

- Всё из `CLAUDE.md`: 3 слоя бэка, связывание в `app.ts`; ФСД и импорты через `index.ts`; Zod на сервере; без `any`; именованные константы; BEM в scoped SCSS; только мобильная вёрстка; i18n во всех 4 локалях (de на «Sie»); без `v-html`
- **Коммиты — только по просьбе пользователя** (в ходе шага 1 пользователь запретил коммиты): исполнители не коммитят и не трогают индекс
- **Новые зависимости ставятся только после Task 0 и подтверждения пользователя**
- Файл: до `MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024`; принимаются JPEG, PNG, WebP (+ HEIC/HEIF, если `sharp` его декодирует — см. Task 0); SVG и GIF — нет; тип — **по декодированию `sharp`**, не по имени/`Content-Type`
- Обработка (решение Claude, ориентир NatsDoll): `rotate()` по EXIF → `resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })` → WebP quality 82; `limitInputPixels: 50_000_000`; метаданные (EXIF/GPS) не сохраняются
- Ключ объекта — `quiz-images/<imageId>.webp`, `imageId` — `randomUUID()`; адрес не зависит от правильности ответа и не содержит id учителя
- Текст вопроса обязателен; вариант — текст, картинка или оба (не пустой); у вопроса и у варианта — не больше одной картинки
- Картинка показывается целиком (`object-fit: contain`); не открылась → заглушка «Картинка не загрузилась», вариант выбираем
- Файл удаляется только после успешного сохранения викторины; «осиротевшие» (не привязанные) — через 24 ч (`ORPHAN_IMAGE_TTL_MS`)
- Лимиты тела запроса: по умолчанию 100 КБ (как сейчас, тест не трогать), `/api/quizzes*` — 160 КБ, `POST /api/quiz-images` — 16 МБ
- Rate limit загрузки (решение Claude): 120/час на учителя, 300/час на IP

## Review Focus

1. **Не картинка под видом картинки** (HTML/SVG/исполняемый файл с именем `photo.jpg` и `Content-Type: image/jpeg`) → 400, в хранилище ничего не записано. Тест в Task 3
2. **«Пиксельная бомба»** (маленький файл с огромными размерами) и битый файл → 400 быстро, без падения процесса. Тест в Task 3
3. **Чужой или несуществующий `imageId`** при сохранении викторины, или `imageId`, уже привязанный к другой викторине → 400. Тест в Task 4
4. **Старые викторины шага 1** (в `questions` нет полей картинок) открываются в редакторе и проходятся. Тест в Task 1 и Task 4
5. **Удаление аккаунта** → после очистки в хранилище не остаётся его файлов. Тест в Task 5

---

### Task 0: Проверка зависимостей (стоп-точка)

**Files:** только отчёт `.superpowers/sdd/2026-11-14-quiz-step2-images/task-0-deps.md` (ничего не устанавливать)

- [ ] **Step 1:** Для `sharp`, `@aws-sdk/client-s3`, `@smithy/node-http-handler` собрать: последняя версия и дата релиза, известные уязвимости (GitHub Advisory / `npm audit` после пробной установки в scratchpad-копию `package.json`, не в репозиторий), активность поддержки, популярность. Версии — те же мажорные, что в `~/Projects/NatsDoll/apps/api/package.json`, если нет причин иначе
- [ ] **Step 2:** Проверить, декодирует ли prebuilt `sharp` HEIC (iPhone) на macOS и в Linux-образе `node:26.5.1-trixie-slim` (`sharp.format.heif.input`)
- [ ] **Step 3:** Отчёт пользователю → **ждать подтверждения** установки. Без подтверждения дальше не идти

### Task 1: Схемы картинок в `packages/shared/schemas`

**Files:** Modify `packages/shared/schemas/quiz.ts`, `quizResponses.ts`, `index.ts`; Test `packages/shared/schemas/quiz.test.ts`

**Interfaces:**
- Produces:
  - `imageIdSchema = z.uuid()`; `MAX_IMAGE_UPLOAD_BYTES`; `IMAGE_UPLOAD_FIELD = 'file'`
  - В `quizInputSchema`: у вопроса `imageId: imageIdSchema.nullable().default(null)`; у варианта `imageId` так же, `text` — `z.string().trim().max(OPTION_TEXT_MAX_LENGTH)` (может быть пустым) + refine «текст или картинка» (path `['questions', i, 'options', j, 'text']`, message `'Text or image is required'`). Текст вопроса — как был (обязателен)
  - Ответы: в `quizResponseSchema` у вопроса и варианта добавить `imageUrl: z.url().nullable()`; `playQuizResponseSchema`: `question.imageUrl: string | null`, `options: { text: string; imageUrl: string | null }[]` (было `string[]`)
  - `imageUploadResponseSchema = { image: { id: string; url: string } }`

- [ ] **Step 1: Тесты** — данные шага 1 без `imageId` проходят и получают `null` (Review Focus 4); вариант только с `imageId` и пустым текстом проходит; вариант без текста и без картинки → issue с message `'Text or image is required'`; вопрос с картинкой, но без текста → ошибка; `imageId: 'not-uuid'` → ошибка
- [ ] **Step 2:** FAIL → реализовать → `npm run test -w packages/shared && npm run typecheck` (api и web упадут на смене `options` в play — это ожидаемо и чинится в Task 4/8; зафиксировать в отчёте)

### Task 2: Хранилище: порт и S3 (Яндекс)

**Files:**
- Create: `apps/api/src/shared/infrastructure/imageStorage.ts` (порт `ImageStorage` + `makeS3ImageStorage(config)`), `apps/api/tests/fakes/memoryImageStorage.ts`
- Modify: `apps/api/src/shared/config/env.ts` (+ `YANDEX_S3_ENDPOINT`, `YANDEX_S3_BUCKET`, `YANDEX_S3_ACCESS_KEY`, `YANDEX_S3_SECRET_KEY` — имена из `docs/architecture.md`; регион `ru-central1` константой, `IMAGES_PUBLIC_BASE_URL`; все обязательны в production, вне production — необязательны: без них загрузка отвечает 503), `.env.example` (переменные без значений + комментарий: для разработки — отдельный бакет `nataskium-dev` с публичным чтением объектов и сервисный аккаунт с правами только на него; ключи только в `.env`), `apps/api/src/index.ts` (создать storage, передать в `createApp` через новое поле `AppDeps.imageStorage: ImageStorage | null`), `apps/api/tests/fakes/testApp.ts` (опция `imageStorage`, по умолчанию `null` — допустимое изменение тестового помощника)
- Test: `apps/api/tests/imageStorage.test.ts`, `apps/api/tests/env.test.ts` (только добавить случаи новых переменных)

**Interfaces:**
- Produces: `type ImageStorage = { put(key: string, body: Uint8Array, contentType: 'image/webp'): Promise<void>; remove(keys: readonly string[]): Promise<void>; listKeys(prefix: string): Promise<string[]>; publicUrl(key: string): string }`. Сбой хранилища → `ExternalServiceError` (→ 503). Ключ проверяется `/^quiz-images\/[0-9a-f-]{36}\.webp$/`
- S3-реализация — по образцу `~/Projects/NatsDoll/apps/api/src/shared/lib/s3Client.ts` (таймауты, ретраи, батчи удаления, `forcePathStyle`, `CacheControl: public, max-age=31536000, immutable`), но конфиг — параметром из `env`, без чтения `process.env` внутри

- [ ] **Step 1:** Тесты: неверный ключ → ошибка до сети; `publicUrl` = `${IMAGES_PUBLIC_BASE_URL}/${key}`; memory-фейк хранит/удаляет/листает; env: production без S3-переменных → ошибка запуска, development без них → `null`-storage
- [ ] **Step 2:** FAIL → реализовать → тесты api + typecheck → PASS; если в `.env` уже есть ключи пользователя — один ручной `put` + `remove` пробного объекта в `nataskium-dev` (без автотестов в сеть)

### Task 3: Загрузка картинки `POST /api/quiz-images`

**Files:**
- Create: `apps/api/src/features/quiz-images/{index.ts,types.ts,limits.ts}`, `application/uploadImage.ts`, `infrastructure/{imageProcessor.ts,quizImageRepository.ts}`, `presentation/imageRoutes.ts`
- Modify: `apps/api/prisma/schema.prisma` (+ `QuizImage`), миграция `create_quiz_images`, `apps/api/src/app.ts` (лимиты тела по путям, маршрут)
- Test: `apps/api/tests/uploadImage.test.ts`, `apps/api/tests/integration/imageRoutes.int.test.ts`, фикстуры в `apps/api/tests/fixtures/images/` (маленькие jpg/png/webp, svg, html-под-jpg, «пиксельная бомба» 20000×20000 png)

**Interfaces:**
- Produces:
  - Таблица `quiz_images`: `id uuid pk`, `teacher_id fk → teachers ON DELETE CASCADE`, `quiz_id uuid null fk → quizzes ON DELETE SET NULL`, `created_at`; индексы `(teacher_id)`, `(quiz_id)`, `(quiz_id, created_at)`
  - `QuizImageRepository`: `create(teacherId): Promise<{ id }>`, `findOwned(ids: string[], teacherId)`, `attach(quizId, ids)`, `detachMissing(quizId, keepIds) → string[]` (возвращает id отвязанных), `deleteRows(ids)`, `listOrphans(olderThan: Date)`, `existingIds(ids)`
  - `processImage(bytes: Uint8Array): Promise<Uint8Array>` (константы из Global Constraints; неподдерживаемый формат/битый/бомба → `AppError(400)`); формат — `sharp(bytes).metadata().format ∈ {jpeg, png, webp, heif?}`
  - `POST /api/quiz-images` (Bearer, multipart поле `file`) → 201 `imageUploadResponseSchema`; 413 при > 16 МБ тела, 400 при файле > 15 МБ или не-картинке, 429 по лимитам, 503 если storage `null`/сбой. Порядок: лимит → тело → обработка → `put` → запись строки (если `put` упал — строки нет)
  - `app.ts`: глобальный `bodyLimit` заменить на выбор лимита по пути (`/api/quiz-images` — 16 МБ, `/api/quizzes*` — 160 КБ, остальное — `MAX_BODY_SIZE_BYTES` 100 КБ); существующий `tests/bodyLimit.test.ts` должен остаться зелёным без правок

- [ ] **Step 1: Тесты** — jpg/png/webp → 201, в storage WebP ≤ 1200 px по большей стороне, EXIF удалён; html/svg под `image/jpeg` → 400, `put` не вызван (Review Focus 1); бомба и битый файл → 400 < 2 с (Review Focus 2); 15 МБ + 1 байт → 400; без токена → 401; 121-я загрузка за час → 429; storage `null` → 503
- [ ] **Step 2:** FAIL → реализовать (основа — `~/Projects/NatsDoll/apps/api/src/features/admin/application/uploadProductImage.ts`, маршрут — `adminRoutes.ts:200-210`) → unit + integration + typecheck → PASS

### Task 4: Картинки в викторине и игре

**Files:** Modify `apps/api/src/features/quizzes/**` (create/update/delete, ответы), `apps/api/src/features/play/application/getPlayQuiz.ts`, `apps/api/src/app.ts`; Test `apps/api/tests/quizzes.test.ts`, `tests/integration/quizRoutes.int.test.ts`, `playRoutes.int.test.ts`

**Interfaces:**
- Consumes: `QuizImageRepository`, `ImageStorage` (Task 2–3), схемы Task 1
- Produces:
  - create/update: все `imageId` из тела → `findOwned` должен вернуть их все, и ни один не привязан к **другой** викторине → иначе 400 (`'Unknown image'`). В транзакции с сохранением: `attach(quizId, ids)`, `detachMissing(quizId, ids)`; **после** успешной транзакции — `storage.remove` отвязанных + `deleteRows` (сбой удаления файла логируется без данных и не валит ответ — сверка из Task 5 добьёт)
  - delete (soft): после успеха — удалить картинки викторины (строки + файлы)
  - Ответы кабинета и игры: `imageUrl = storage.publicUrl(key)` или `null`; в игре варианты — `{ text, imageUrl }`
- [ ] **Step 1: Тесты** — сохранение с чужим/выдуманным `imageId` → 400 (Review Focus 3); картинка викторины A в викторине B → 400; замена картинки → старый файл удалён из memory-storage только после успешного PATCH, при 400 — не удалён; удаление викторины → файлы удалены; викторина шага 1 без картинок: GET кабинета и игры работают (Review Focus 4); игра не раскрывает правильность через `imageUrl` (ключи одинакового вида у верных и неверных); 50 вопросов × (200 «我» + 6 × 60 «我») + 7 `imageId` на вопрос → 201 (лимит 160 КБ)
- [ ] **Step 2:** FAIL → реализовать → unit + integration + typecheck api → PASS

### Task 5: Очистка и сверка хранилища (GDPR)

**Files:** Create `apps/api/src/features/quiz-images/application/cleanupImages.ts`; Modify `apps/api/src/app.ts` / `createAuthCleanup` или отдельная `createImageCleanup`, `apps/api/src/index.ts` (своё расписание `startCleanupSchedule` с `IMAGE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000`; первый запуск — при старте); Test `apps/api/tests/cleanupImages.test.ts`, `tests/integration/imageCleanup.int.test.ts`

**Interfaces:**
- Produces: `makeCleanupImages({ images, storage, now })` — (1) строки без `quiz_id` старше `ORPHAN_IMAGE_TTL_MS = 24 ч` → удалить файл и строку; (2) `listKeys('quiz-images/')` → ключи, для которых нет строки (`existingIds`), удалить из хранилища. Без storage — ничего не делает
- [ ] **Step 1: Тесты** — неприкреплённая картинка 25 ч назад удалена, 1 ч назад — нет; удаление аккаунта учителя (через существующий путь `deleteTeacherRows`) + запуск очистки → в memory-storage нет его файлов (Review Focus 5); файл в хранилище без строки — удалён; прикреплённые — не тронуты
- [ ] **Step 2:** FAIL → реализовать → тесты + typecheck → PASS

### Task 6: Фронт — загрузка в `entities/quiz`

**Files:** Modify `apps/web/src/shared/api/apiClient.ts` (`body` может быть `FormData`: без `Content-Type`, без `JSON.stringify`), `apps/web/src/entities/quiz/{quizApi.ts,types.ts,index.ts,newQuestion.ts}`; Create `apps/web/src/entities/quiz/imageApi.ts`, `pickImageFile.ts`; Test `imageApi.nuxt.test.ts`, `pickImageFile.test.ts`, `apiClient.test.ts` (только добавить случай FormData)

**Interfaces:**
- Produces: `imageApi.upload(file: File, accessToken: string): Promise<{ id: string; url: string }>`; `pickImageFile(source: DataTransfer | ClipboardEvent['clipboardData'] | FileList | null): File | null` (первый файл `image/*`); `validateImageFile(file): 'ok' | 'tooLarge' | 'notImage'` (клиентская подсказка, сервер решает сам); `newQuestion()`/`newQuiz()` — с `imageId: null`
- [ ] **Step 1:** Тесты: FormData уходит без `Content-Type`; `pickImageFile` берёт картинку из буфера/перетаскивания и игнорирует текст; 15 МБ + 1 → `'tooLarge'`
- [ ] **Step 2:** FAIL → реализовать → test + typecheck web → PASS

### Task 7: Редактор — добавление картинок (логика + каркас)

**Files:** Create `apps/web/src/widgets/quiz-editor/components/ImageField.vue`; Modify `store.ts`, `QuestionCard.vue`, `QuizEditor.vue`, i18n 4 локали; Test `imageField.nuxt.test.ts`, `store.nuxt.test.ts`

**Interfaces:**
- Consumes: `imageApi`, `pickImageFile`, `validateImageFile`, `authorizedRequest`
- Produces: `ImageField` (props `imageUrl: string | null`, `variant: 'question' | 'option'`; emits `change: [{ id: string; url: string } | null]`): кнопка выбора файла (`<input type="file" accept="image/jpeg,image/png,image/webp,image/heic">`), drop-зона, вставка Ctrl+V при фокусе на поле (`tabindex="0"`); состояния idle / uploading / error (`tooLarge`, `notImage`, `failed`); «Заменить», «✕». Store: `setQuestionImage(qi, image | null)`, `setOptionImage(qi, oi, image | null)`; в UI хранится и `imageUrl` для превью, в API уходит только `imageId`. Текст варианта необязателен при картинке (подсказка «Текст (необязательно)»)
- Тексты (ru): «Добавить картинку», «Выберите файл, перетащите или вставьте (Ctrl+V)», «Заменить», «Убрать картинку», «Загрузка…», «Файл слишком большой, максимум 15 МБ», «Это не картинка. Подойдут JPEG, PNG, WebP», «Не получилось загрузить картинку»
- [ ] **Step 1: Тесты** — drop файла → `imageApi.upload` вызван, превью; вставка картинки из буфера → то же; файл > 15 МБ → ошибка без запроса; ошибка сервера → сообщение, предыдущая картинка остаётся; «✕» → `imageId: null`; сохранение отправляет `imageId`, не `imageUrl`
- [ ] **Step 2:** FAIL → реализовать каркас (без стилей) → test + typecheck + lint → PASS

### Task 8: Страница задания — картинки

**Files:** Modify `apps/web/src/widgets/quiz-play/{store.ts,components/PlayQuestion.vue}`, `tests/e2e/quizPlay.spec.ts` (обновить моки под новую форму `options`), i18n («Картинка не загрузилась», «Картинка {n}» для варианта без текста); Test `store.nuxt.test.ts`, `playImages.nuxt.test.ts`

**Interfaces:**
- Consumes: новая форма `playQuizResponseSchema` (Task 1)
- Produces: картинка вопроса над вариантами; в варианте — картинка + текст (если есть); `<img alt="">` декоративно, если есть текст; если варианта текст пуст — `aria-label` кнопки «Картинка {n}»; `@error` → заглушка «Картинка не загрузилась», кнопка остаётся рабочей; перемешивание не теряет картинку варианта
- [ ] **Step 1: Тесты** — вариант-картинка выбирается и уходит исходным индексом; ошибка загрузки `<img>` → заглушка, выбор работает; e2e: викторина с картинками проходится на phone
- [ ] **Step 2:** FAIL → реализовать → unit + e2e quizPlay → PASS

### Task 9: Вёрстка (ui-designer)

- [ ] Редактор: `ImageField` (drop-зона, превью, миниатюры у вариантов, состояния) — по `.superpowers/brainstorm/30443-1794647877/content/editor-images.html` (без поля описания)
- [ ] Страница задания: `contain`, светлые поля, сетка вариантов-картинок — по `play-images.html` (вариант B); заглушка
- [ ] 375/320 px, клавиатура, reduced-motion; тесты/линт/e2e зелёные

### Task 10: Финал

- [ ] `docs/architecture.md`: таблица `quiz_images`, маршрут загрузки, лимиты тела по путям, `ImageStorage`, dev-бакет, суточная очистка и сверка, CSP `img-src` + домен хранилища (к деплою), переменные `YANDEX_S3_*` и `IMAGES_PUBLIC_BASE_URL`
- [ ] lint, typecheck, все тесты, integration, e2e phone+desktop, `npm audit` (high/critical блокируют)
- [ ] tester и финальное ревью ветки (code-reviewer, самая сильная модель)
- [ ] Ручная проверка: `docker compose up -d` → загрузить фото с телефона, вставить скриншот Ctrl+V, перетащить файл, пройти викторину по ссылке

## Исполнение (решение пользователя 2026-11-14)

- Исполнитель — `fullstack-developer` на **Opus**; вёрстка — `ui-designer` (Opus)
- Ревью задач — `code-reviewer` на **Sonnet**; для Task 3–5 (загрузка, «своя картинка», очистка) — на **Opus**
- Финальный `tester` — **Sonnet**; короткие повторные проверки мелких исправлений — **Haiku**
- Без коммитов: база задачи фиксируется контроллером через `git add`
