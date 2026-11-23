# План: гонка выдачи сессии и отзыва учётных данных (auth/session-issuance-races-credential-revocation)

## Цель
Сделать так, чтобы сброс пароля, смена пароля и «выйти везде» отзывали все сессии без исключений: ни ротация (гонка A), ни вход по старому паролю (гонка B) не должны оставлять живой refresh-токен. Без миграций.

## Решение: advisory xact lock по teacherId + повторная сверка хэша в createFamily

Сравнение вариантов:

| | advisory lock по teacherId | SELECT ... FOR (NO KEY) UPDATE строки учителя | колонка версии учётных данных |
|---|---|---|---|
| Миграция | нет | нет | **да (высокий риск)** |
| Новые взаимоблокировки | нет: ждущий lock ничего не держит, дальше порядок блокировок прежний | да: учитель → токены против deleteTeacherRows (токены → учитель), completeLink, reauth.deleteAccount — их пришлось бы переупорядочить | нет, но проверка переезжает в findByHash/rotate (join) |
| Затронутые файлы | 3 репозитория + новый файл блокировки | те же + teacherRepository.deleteTeacherRows, pendingGoogleReauthRepository, pendingGoogleLinkRepository | schema.prisma, миграция, все места выдачи, findByHash, logoutAll (UPDATE учителя) |
| Закрывает A | да | да | да, только через проверку версии при каждом refresh |
| Закрывает B | да (с перечиткой хэша) | да | да |

**Выбор — advisory lock.** Довод: блокировка — отдельный ресурс, который берут только транзакции выдачи, ротации и отзыва, и всегда **первой командой**. Тот, кто ждёт её, ещё ничего не держит, поэтому в цикл ожидания он попасть не может. После блокировки порядок остальных блокировок не меняется. Строчная блокировка учителя конфликтует с DELETE/UPDATE учителя в транзакциях, которые эту схему не используют (deleteTeacherRows, completeLink), и вынуждает менять их порядок. Колонка версии — это миграция плюс изменения в 6+ местах.

Ключ: `pg_advisory_xact_lock(hashtextextended('teacher-sessions:' || teacherId, 0))`, teacherId передаётся параметром, как в `emailLock.ts:6-8`. Префикс отделяет ключ от ключей lockEmail. Даже при коллизии хэшей цикла не будет: держатели lockEmail не берут teacher-lock, а держатели teacher-lock не берут lockEmail.

**Обязательно:** lock — отдельная команда **до** чтений и DELETE в транзакции. В READ COMMITTED снимок берётся на каждую команду, поэтому DELETE/SELECT после ожидания блокировки видит строки, закоммиченные её прежним владельцем. На этом держится закрытие A.

## Почему это закрывает A и B
- **A (rotate ↔ отзыв).** Обе транзакции берут teacher-lock первой командой и поэтому идут строго по очереди. Если отзыв первый, то токен удалён, UPDATE в rotate даёт count=0 → `alreadyUsed` → 401. Если rotate первый, преемник закоммичен до того, как отзыв получит блокировку, и DELETE его видит. С createFamily то же самое.
- **B (login ↔ сброс/смена).** Все, кто пишет `passwordHash` (completeReset, changePassword), держат teacher-lock до коммита. createFamily после получения блокировки перечитывает `teachers.password_hash` и сравнивает со сверенным хэшем. Не совпало → ничего не пишет, false. Если сброс начался позже, он ждёт блокировку и удаляет уже закоммиченную семью.

## Файлы для изменения
- `apps/api/src/features/auth/infrastructure/refreshTokenRepository.ts`
  - `:23-50 createFamily`: новый необязательный аргумент `verifiedPasswordHash?: string`. В транзакции (`:26`) первой командой teacher-lock; затем, если хэш передан, `tx.teacher.findUnique({ id, select: passwordHash })`: `null` или хэш не совпал → бросить внутренний сигнал (класс-сигнал, как `StalePasswordHash` в `teacherRepository.ts:18`), поймать вне `$transaction` → `return false`. Сверка идёт **до** вытеснения (`:30-38`): старые семьи не удаляются при отказе. Сигнал вместо возвращаемого значения транзакции нужен, чтобы не сломать мок в `tests/refreshSession.test.ts:327-358`: там `$transaction` резолвится `undefined`, и ожидается `true`. Повтор при P2034 и P2003 → false остаются.
  - `:54-73 rotate`: первой командой в `:56` (до `updateMany` `:57`) teacherId берётся из `next.teacherId`.
  - `:79-81 deleteAllForTeacher`: обернуть в `$transaction`: teacher-lock, затем `deleteMany`.
  - Комментарии `:15`, `:27-28` дополнить: teacher-lock первым.
- `apps/api/src/features/auth/infrastructure/passwordResetRepository.ts:35-58 completeReset`: (1) teacher-lock (`reset.teacherId`) первой командой, до CAS `:37`. Если брать её позже (у `:50`), completeReset держал бы строку учителя (UPDATE `:45`) в ожидании блокировки, а changePassword держал бы блокировку в ожидании строки учителя — взаимоблокировка. (2) Перенести `refreshToken.deleteMany` (`:50`) и `pendingGoogleLink.deleteMany` (`:52`) **до** `teacher.updateMany` (`:45`). Это закрывает существующий цикл с `deleteTeacherRows`: сейчас completeReset держит учителя (`:45`) и ждёт токены (`:50`), а удаление держит токены (`teacherRepository.ts:48`) и ждёт учителя (`:50`); P2034 у completeReset не обрабатывается → 500. Перенос `pending_google_links` закрывает такой же цикл с `completeLink` (E → link → учитель). Поведение то же: одна транзакция, под TL никто не вклинится; при `updated.count !== 1` учителя нет, и его токены и привязки и так ушли каскадом. Комментарий `:42-43` обновить.
- `apps/api/src/features/auth/infrastructure/teacherRepository.ts:80-82 changePassword`: teacher-lock первой командой, до `deleteMany` `:82`; комментарий `:81` дополнить. `deleteTeacherRows` (`:38-52`) и `deleteAccount` (`:59-76`) **не менять**.
- `apps/api/src/features/auth/types.ts:68-70`: `createFamily(token, maxFamilies, verifiedPasswordHash?: string): Promise<boolean>`, в комментарии false = «учителя нет или пароль сменили после сверки». `:78` — комментарий, что deleteAllForTeacher идёт под teacher-lock. Тип возврата остаётся boolean, поэтому существующие тесты «createFamily → false» не меняются.
- `apps/api/src/features/auth/application/issueSession.ts:34,40-51`: `issueSession(deps, teacher, verifiedPasswordHash?: string)` передаёт хэш в createFamily; при false, как сейчас, `sessionInvalid()`. Комментарий `:50` расширить.
- `apps/api/src/features/auth/application/login.ts:52`: `issueSession(deps, teacher, teacher.passwordHash)`, тот хэш, что прочитан в `:28` и сверен в `:39` (non-null после проверки `:47`).
- `apps/api/src/features/auth/application/changePassword.ts:57`: передать **новый** `passwordHash`. Тогда сброс, закоммиченный между `teachers.changePassword` и выдачей, не даст сессию.
- `apps/api/src/features/auth/application/googleLink.ts:81`: передать `link.teacherPasswordHash` (сверенный в `:64`). Тип `string | null`; после успешной сверки он не null (verify(null) — dummy, false), сузить без нового ответа. **Это решение вне формулировки задачи — см. «Открытые вопросы».**
- **Не менять:** `verifyEmail.ts:60`, `googleAuth.ts:48` (без хэша, только teacher-lock в createFamily), `logoutAll.ts`, `refreshSession.ts`, `deleteTeacherRows`, `pendingGoogleReauthRepository.ts`, `pendingGoogleLinkRepository.ts`, `pendingRegistrationRepository.ts`, `emailLock.ts`, `app.ts`, `index.ts` фичи (публичный API не меняется).

## Файлы для создания
- `apps/api/src/features/auth/infrastructure/teacherSessionLock.ts`: `lockTeacherSessions(tx, teacherId)` по образцу `emailLock.ts`. Короткий комментарий: кто берёт, «первой командой», почему отдельная команда.
- `apps/api/tests/integration/sessionRevocationRaces.int.test.ts`: гонки на двух соединениях (ниже).

## Итоговый порядок блокировок (TL = teacher-lock, E = lockEmail)
| Операция | Порядок |
|---|---|
| rotate | TL → строка старого токена (UPDATE) → KEY SHARE учителя (FK INSERT) |
| createFamily | TL → чтение password_hash (без блокировки) → токены вытесняемых семей → KEY SHARE учителя (FK INSERT) |
| deleteAllForTeacher (logout-all) | TL → токены учителя |
| changePassword | TL → токены → строка учителя (UPDATE) → password_resets → pending_google_links → pending_google_reauths |
| completeReset | TL → своя password_resets → pending_google_reauths → токены → pending_google_links → строка учителя (UPDATE) → password_resets |
| deleteTeacherRows (deleteAccount по паролю и через Google) | без изменений: E → [pending_google_reauths] → pending_registrations → токены → строка учителя (DELETE, каскад) |
| activate / signInWithGoogle / completeLink | без изменений: E → ... |
| deleteFamily (refreshSession), deleteExpired | без изменений, TL не нужен: они только удаляют |

Почему нет новых циклов: держатели TL между собой идут по очереди, а ждущий TL ничего не держит. Транзакции без TL (с E) никогда не ждут TL, поэтому новых рёбер ожидания нет. Попутно закрываются **три существующих цикла**: changePassword ↔ completeReset (через TL: сейчас первая держит учителя и ждёт password_resets, вторая — наоборот), а также completeReset ↔ deleteTeacherRows и completeReset ↔ completeLink (через перенос токенов и привязок до UPDATE учителя: теперь у всех «токены/привязки → учитель»).

## Ответ при неудачной перепроверке
- **login**: 401 через `sessionInvalid()` из issueSession, как сейчас при «учителя удалили». Фронтенд на 401 у формы входа показывает «Неверная почта или пароль» (`apps/web/src/features/auth/authErrors.ts`), а это верно: пароль уже не действует. deviceToken не выдаётся. Резерв лимита уже снят в `login.ts:51`, неудача **не засчитывается**: пароль был верным, отказ вызван гонкой. Поведение совпадает с тестом `login.test.ts:210`.
- **changePassword**: 401 `sessionInvalid()`, как при `!changed` (`changePassword.ts:55`). Пароль сменён, учитель входит заново. Письмо о смене не уходит (как сейчас при throw из issueSession); письмо о сбросе уже отправил completeReset.
- **googleLink**: 401 `sessionInvalid()`, как при teacherGone. Google к этому моменту уже привязан.

## Шаги
### 1. teacherSessionLock.ts [small]
Infrastructure, по образцу emailLock.ts.
### 2. Блокировка в репозиториях [medium]
rotate, createFamily (со сверкой хэша и сигналом), deleteAllForTeacher, completeReset, changePassword — везде первой командой. Комментарии о порядке обновить точечно.
### 3. Контракт и use-case [small]
types.ts, issueSession.ts, login.ts, changePassword.ts, googleLink.ts. Каждый use-case остаётся одним файлом в application/, новых use-case нет.
### 4. Фейки [small]
`tests/fakes/authFakes.ts`:
- `makeFakeRefreshTokens` (`:199-223`): в `families` записывать `verifiedPasswordHash`; `state.passwordChanged` → false.
- `makeMemoryRefreshTokens` (`:254-258`): принимать третий аргумент, тот же флаг.
### 5. Unit-тесты [small]
- `issueSession.test.ts`: хэш доходит до createFamily; без хэша → undefined; `passwordChanged` → 401 SESSION_INVALID, токены не выдаются.
- `login.test.ts`: createFamily получает `hashOf(PASSWORD)` прочитанного учителя; `passwordChanged` → 401, нет deviceToken, `limiter.state.failures === 0`.
- `changePassword.test.ts`: createFamily получает **новый** хэш; `passwordChanged` → 401, письмо не отправлено.
- `googleLink.test.ts`: получает `link.teacherPasswordHash`.
- `verifyEmail.test.ts`, `googleSignIn.test.ts`: хэш undefined.
- `refreshSession.test.ts:302-380` — не трогать (должны пройти без правок; это проверка паттерна-сигнала).
- Проверено grep: unit-тесты над фейковым prisma есть только в `refreshSession.test.ts` (rotate/createFamily через `$transaction`-мок; `deleteAllForTeacher` там не вызывается) и `deleteAccount.test.ts:245-265` (только `deleteAccount`, не меняется). Других правок unit-тестов из-за `$executeRaw`/`$transaction` не нужно.
- Интеграционный `passwordResetRepository.int.test.ts`: добавить кейс «после сброса токены и привязки удалены, хэш новый» — проверка, что перенос шагов сохранил результат (если такого кейса ещё нет).
### 6. Интеграционные тесты [medium]
Запускать по правилу «интеграцию гоняет один агент за раз».
- `refreshTokenRepository.int.test.ts` (describe createFamily): хэш совпал → true; не совпал → false, ничего не записано и **старые семьи не вытеснены** (при MAX_FAMILIES); учитель без пароля + хэш → false.
- Новый `sessionRevocationRaces.int.test.ts`, детерминированные расписания:
  - Инструмент: Proxy над prisma, как `countingTransactions` в `deleteAccount.int.test.ts:224-238`. `$transaction` оборачивает `tx` так, что `tx.refreshToken.create` сначала выполняет вставку, **потом** вызывает `paused()` и ждёт `release`. Транзакция стоит с незакоммиченным INSERT. Наблюдатель — третье соединение (обычный `prisma`): ожидание через опрос `pg_stat_activity` (`wait_event_type = 'Lock'`, `datname = current_database()`, не своё соединение) до появления ожидающего, а не через sleep. Пул pg-адаптера 10 соединений — хватает.
  - **A1, rotate ↔ logoutAll:** (1) rotate через обёрнутый репозиторий → `await paused`; (2) запустить `deleteAllForTeacher`; (3) дождаться ожидающего в pg_stat_activity; (4) `release()`; (5) дождаться обоих. Ожидание: rotate = `rotated`, `refresh_tokens` учителя = 0, refresh новым токеном → 401. На старом коде преемник выживает **всегда**: снимок DELETE взят до коммита INSERT, а EvalPlanQual перепроверяет только старую строку. Тест падает детерминированно.
  - **A2, rotate ↔ completeReset** и **A3, rotate ↔ changePassword**: то же расписание, после — 0 токенов, хэш новый.
  - **A4, createFamily ↔ completeReset:** createFamily на паузе после INSERT. Шаг (3): проба «появился ожидающий **или** промис completeReset завершился», с ограниченным сроком: на старом коде completeReset не ждёт (UPDATE учителя совместим с KEY SHARE) и завершается сразу; проба не должна висеть до таймаута теста. После release — 0 токенов; на старом коде тест падает на этой проверке. То же правило пробы — во всех расписаниях.
  - **B1, login ↔ resetPassword:** настоящие репозитории; hasher-обёртка, у которой `verify` после настоящей сверки вызывает `paused()` и ждёт `release`. Пока login на паузе, `resetPassword` проходит целиком. Затем release → login 401 SESSION_INVALID, у учителя 0 токенов. Блокировки БД здесь не участвуют, расписание задаётся только промисами.
  - **B2, changePassword ↔ resetPassword:** обёртка `teachers.changePassword` после коммита ждёт release; resetPassword целиком; release → 401, 0 токенов.
  - **Без взаимоблокировок:** серии (по образцу `deleteAccount.int.test.ts:217-...`, счётчик транзакций): rotate ↔ completeReset, createFamily(с вытеснением) ↔ changePassword, changePassword ↔ completeReset — без P2034, без повторов, без 500. Существующие гонки rotate/createFamily ↔ deleteAccount должны пройти без правок.
  - `sessionLifecycle.int.test.ts` — не трогать; при желании один сквозной кейс «login после reset старым паролем → 401».

## Риски и крайние случаи
- Миграций нет.
- Ожидание блокировки ограничено `statement_timeout` 5 с (`shared/infrastructure/prisma.ts:5`) и таймаутом интерактивной транзакции Prisma (5 с). Держатели TL работают миллисекунды; ожидающий занимает соединение пула (10). Очередь — только в пределах одного учителя. Вход ограничен rate limit.
- Отмена ожидания по statement_timeout (57014) не P2034: вернётся 500. Это допустимо как аномалия, обрабатывать отдельно не планируется.
- Отзыв, выигравший гонку у refresh, приводит rotate к `alreadyUsed` → `console.warn('Refresh token reuse detected')` и deleteFamily (`refreshSession.ts:60-65`). Ложное предупреждение в логе было и раньше, ответ верный (401); вне задачи.
- Остаточных известных циклов с completeReset нет. Порядок «токены → учитель» теперь общий для rotate, createFamily, changePassword, completeReset и deleteTeacherRows.
- Доступ по access-токену живёт до 15 минут после отзыва — это продуктовое решение, не меняется.
- В `packages/shared` изменений нет, фронтенд не трогается.
- Новых зависимостей нет, персональных данных нет.
- Рабочее дерево содержит незакоммиченные правки в teacherRepository.ts, changePassword.ts, types.ts и тестах. Перед изменением 3+ файлов предложить пользователю checkpoint-коммит.

## Открытые вопросы
1. googleLink: сверять `link.teacherPasswordHash` (рекомендую: привязка подтверждена паролем, это тот же случай B) или оставить без сверки, как google/callback и verify-email?
2. changePassword при `passwordChanged`: оставить без письма о смене (как сейчас при throw) или отправить письмо, ведь пароль был сменён этим запросом? По умолчанию — без изменений.
