export { MAX_ACTIVE_SESSIONS, REFRESH_TOKEN_TTL_MS, SESSION_ABSOLUTE_TTL_MS } from './application/issueSession'
export { PENDING_REGISTRATION_TTL_MS, makeRegister } from './application/register'
export { makeVerifyEmail } from './application/verifyEmail'
export { makePasswordHasher } from './infrastructure/passwordHasher'
export { makePendingRegistrationRepository } from './infrastructure/pendingRegistrationRepository'
export { makeRefreshTokenRepository } from './infrastructure/refreshTokenRepository'
export { makeTeacherRepository } from './infrastructure/teacherRepository'
export { makeTokenService } from './infrastructure/tokenService'
export type {
  AuthSession,
  Clock,
  EmailQuota,
  EmailSender,
  FailureLimiter,
  FailureReservation,
  PasswordHasher,
  PendingRegistrationRepository,
  RefreshTokenRepository,
  TeacherRepository,
  TeacherView,
  TokenService,
} from './types'
