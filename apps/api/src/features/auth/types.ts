import type { TeacherView } from '@nataskium/shared/schemas'

// Контракты фичи auth без типов Prisma: application/ знает только их, реализации — в infrastructure/

export type TeacherAccount = {
  id: string
  email: string
  displayName: string | null
  passwordHash: string | null
  googleId: string | null
  emailVerifiedAt: Date | null
}

export type GoogleTeacherProfile = {
  googleId: string
  // Уже нормализован emailSchema
  email: string
  // Уже прошёл displayNameSchema; null — Google не дал имени или оно не прошло проверку
  displayName: string | null
}

export type GoogleSignInResult =
  | { status: 'signedIn'; teacher: TeacherAccount }
  // Учитель с этим email есть и без Google: привязка — только после ввода его пароля (googleLink)
  | { status: 'passwordRequired'; teacherId: string }
  // У учителя с этим email уже привязан другой Google-аккаунт
  | { status: 'conflict' }

export type TeacherRepository = {
  findByEmail(email: string): Promise<TeacherAccount | null>
  findById(id: string): Promise<TeacherAccount | null>
  // Одна транзакция под lockEmail: найти по googleId; учитель с этим email без Google — passwordRequired, ничего
  // не меняя; иначе создать без пароля. Ожидающие регистрации email удаляются: пароли до подтверждения отбрасываются
  signInWithGoogle(profile: GoogleTeacherProfile, now: Date): Promise<GoogleSignInResult>
}

export type RefreshSession = {
  id: string
  teacherId: string
  familyId: string
  familyExpiresAt: Date
  expiresAt: Date
  revokedAt: Date | null
}

export type NewRefreshToken = {
  teacherId: string
  familyId: string
  familyExpiresAt: Date
  tokenHash: string
  expiresAt: Date
}

export type RefreshTokenRepository = {
  // Новая семья при входе; самые старые семьи сверх maxFamilies удаляются в той же транзакции
  createFamily(token: NewRefreshToken, maxFamilies: number): Promise<void>
  findByHash(tokenHash: string): Promise<RefreshSession | null>
  // CAS: отзывает старый токен, только если он ещё не отозван, и создаёт преемника; false — токен уже использован.
  // now — время отзыва: часы приходят из use-case, а не из репозитория
  rotate(oldTokenId: string, next: NewRefreshToken, now: Date): Promise<boolean>
  deleteFamily(familyId: string): Promise<void>
  deleteAllForTeacher(teacherId: string): Promise<void>
  // Отозванные токены не удаляются раньше срока: по ним срабатывает обнаружение повторного использования
  deleteExpired(now: Date): Promise<number>
}

export type PendingRegistration = {
  id: string
  email: string
  passwordHash: string
  displayName: string | null
  expiresAt: Date
}

export type NewPendingRegistration = {
  email: string
  passwordHash: string
  displayName: string | null
  tokenHash: string
  expiresAt: Date
}

export type ActivationResult =
  | { status: 'activated'; teacher: TeacherAccount }
  // Запись уже удалена: параллельное подтверждение тем же токеном или подтверждение другой записью этого email
  | { status: 'alreadyUsed' }
  // Учитель с этим email уже есть, например вошёл через Google
  | { status: 'emailTaken' }

export type PendingRegistrationRepository = {
  create(registration: NewPendingRegistration): Promise<void>
  findByTokenHash(tokenHash: string): Promise<PendingRegistration | null>
  // Одна транзакция: удалить свою запись (CAS по id и tokenHash), удалить все записи email, создать учителя
  // с паролем и именем этой записи. now — для проверки срока записи и emailVerifiedAt
  activate(registration: PendingRegistration, tokenHash: string, now: Date): Promise<ActivationResult>
  deleteExpired(now: Date): Promise<number>
}

export type PasswordReset = {
  id: string
  teacherId: string
  expiresAt: Date
}

export type NewPasswordReset = {
  teacherId: string
  tokenHash: string
  expiresAt: Date
}

export type PasswordResetResult =
  // Кому сообщить о смене пароля: адрес и имя учителя на момент сброса
  | { status: 'reset'; teacher: { email: string; displayName: string | null } }
  // Запись уже удалена (ссылку использовали или запросили новую), истекла, или учителя уже нет
  | { status: 'invalid' }

export type PasswordResetRepository = {
  // Заменить запись учителя новой (у учителя одна запись): старая ссылка перестаёт работать
  replaceForTeacher(reset: NewPasswordReset): Promise<void>
  findByTokenHash(tokenHash: string): Promise<PasswordReset | null>
  // Одна транзакция: удалить свою запись (CAS по id, tokenHash и сроку), все записи сброса учителя,
  // все его refresh-токены и ожидающие привязки Google, записать новый хэш пароля
  completeReset(reset: PasswordReset, tokenHash: string, passwordHash: string, now: Date): Promise<PasswordResetResult>
  deleteExpired(now: Date): Promise<number>
}

export type PendingGoogleLink = {
  id: string
  teacherId: string
  googleId: string
  // HMAC секрета из cookie браузера, вернувшегося из Google
  linkSecretHash: string
  expiresAt: Date
  // Для лимита неудач и сверки пароля: актуальные на момент проверки
  teacherEmail: string
  teacherPasswordHash: string | null
}

export type NewPendingGoogleLink = {
  teacherId: string
  googleId: string
  tokenHash: string
  linkSecretHash: string
  expiresAt: Date
}

export type GoogleLinkResult =
  | { status: 'linked'; teacher: TeacherAccount }
  // Ссылку уже использовали, она истекла или заменена новой, учителя уже нет
  | { status: 'invalid' }
  // Этот Google-аккаунт уже привязан к другому учителю, или к этому учителю привязан другой
  | { status: 'conflict' }

export type PendingGoogleLinkRepository = {
  // Одна запись на учителя: новая заменяет прежнюю
  replaceForTeacher(link: NewPendingGoogleLink): Promise<void>
  findByTokenHash(tokenHash: string): Promise<PendingGoogleLink | null>
  // Одна транзакция под lockEmail: удалить свою запись (CAS по id, tokenHash и сроку) и записать googleId учителю
  completeLink(link: PendingGoogleLink, tokenHash: string, now: Date): Promise<GoogleLinkResult>
  deleteExpired(now: Date): Promise<number>
}

export type PasswordHasher = {
  // false — очередь хэширования заполнена: вызывающий отвечает 503, не тратя лимит неудачных входов
  hasCapacity(): boolean
  // То же, что hasCapacity, но бросает ServiceBusyError (503 с Retry-After)
  assertCapacity(): void
  hash(password: string): Promise<string>
  // storedHash === null (учителя нет или вход только через Google) — сверка с dummy-хэшем за то же время
  verify(storedHash: string | null, password: string): Promise<boolean>
}

export type AccessTokenClaims = { teacherId: string }

export type TokenService = {
  signAccessToken(teacherId: string): Promise<string>
  // null — подпись, срок, iss, aud, typ или payload не прошли проверку
  verifyAccessToken(token: string): Promise<AccessTokenClaims | null>
  // Сырой токен для cookie и писем: AUTH_TOKEN_BYTES случайных байт в base64url
  generateOpaqueToken(): string
  // В базе хранится только HMAC-SHA256 (hex)
  hashOpaqueToken(token: string): string
}

// Отправка вне критического пути ответа; ссылки из сырого токена строит реализация (часть F), токен — только в письмо
export type EmailSender = {
  // Без имени: его задал ещё не подтверждённый регистрирующийся — иначе это фишинговый текст с нашего домена
  sendVerificationEmail(to: string, rawToken: string): Promise<void>
  // Имя подтверждённого владельца аккаунта; реализация обязана экранировать его в HTML
  sendAccountExistsEmail(to: string, displayName?: string | null): Promise<void>
  sendPasswordResetEmail(to: string, rawToken: string, displayName?: string | null): Promise<void>
  // После успешного сброса: если это был не владелец, он узнает и сбросит пароль снова. Ссылка — без токена
  sendPasswordChangedEmail(to: string, displayName?: string | null): Promise<void>
  // К существующему аккаунту привязан вход через Google. Ссылка — без токена
  sendGoogleLinkedEmail(to: string, displayName?: string | null): Promise<void>
}

// Бюджет писем на адрес (часть E: in-memory, по нормализованному email); false — бюджет исчерпан
export type EmailQuota = {
  tryConsume(email: string): boolean
}

// Неудачная попытка резервируется до сверки пароля одним синхронным шагом; release — если пароль верный
export type FailureReservation =
  | { allowed: true; release(): void }
  | { allowed: false; retryAfterSeconds: number }

export type FailureLimiter = {
  reserve(key: string): FailureReservation
}

export type Clock = () => Date

// Что учитель видит о себе — из схемы ответа в shared: фронтенд разбирает ответ той же схемой
export type { TeacherView }

export type AuthSession = {
  accessToken: string
  // Сырой refresh-токен — только в httpOnly cookie
  refreshToken: string
  refreshTokenExpiresAt: Date
  teacher: TeacherView
}

// Профиль из проверенного id_token Google (подпись, iss, aud, exp, nonce проверены реализацией)
export type GoogleProfile = {
  googleId: string
  email: string
  emailVerified: boolean
  name: string | null
}

// Параметры одного входа: state и nonce — против подмены ответа, codeVerifier — PKCE
export type GoogleAuthorizationRequest = {
  url: string
  state: string
  codeVerifier: string
  nonce: string
}

export type GoogleExchangeResult =
  | { ok: true; profile: GoogleProfile }
  // id_token не прошёл проверку (подпись, iss, aud, exp, nonce, формат)
  | { ok: false; reason: 'invalidToken' }

export type GoogleIdentityProvider = {
  createAuthorizationRequest(): GoogleAuthorizationRequest
  // Сетевые сбои и ответы Google не 2xx — ExternalServiceError
  exchangeCode(code: string, codeVerifier: string, nonce: string): Promise<GoogleExchangeResult>
}
