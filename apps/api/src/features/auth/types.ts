// Контракты фичи auth без типов Prisma: application/ знает только их, реализации — в infrastructure/

export type TeacherAccount = {
  id: string
  email: string
  displayName: string | null
  passwordHash: string | null
  googleId: string | null
  emailVerifiedAt: Date | null
}

export type TeacherRepository = {
  findByEmail(email: string): Promise<TeacherAccount | null>
  findById(id: string): Promise<TeacherAccount | null>
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
  sendVerificationEmail(to: string, rawToken: string): Promise<void>
  sendAccountExistsEmail(to: string): Promise<void>
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

// Что учитель видит о себе: без хэша пароля и googleId
export type TeacherView = {
  id: string
  email: string
  displayName: string | null
  hasPassword: boolean
  hasGoogle: boolean
}

export type AuthSession = {
  accessToken: string
  // Сырой refresh-токен — только в httpOnly cookie
  refreshToken: string
  refreshTokenExpiresAt: Date
  teacher: TeacherView
}
