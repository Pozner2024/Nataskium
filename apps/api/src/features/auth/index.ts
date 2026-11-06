export { MAX_ACTIVE_SESSIONS, REFRESH_TOKEN_TTL_MS, SESSION_ABSOLUTE_TTL_MS } from './application/issueSession'
export { makeGetMe } from './application/getMe'
export { makeLogin } from './application/login'
export { makeLogout } from './application/logout'
export { makeLogoutAll } from './application/logoutAll'
export { MIN_REMAINING_SESSION_MS, makeRefreshSession } from './application/refreshSession'
export { PENDING_REGISTRATION_TTL_MS, makeRegister } from './application/register'
export { makeVerifyEmail } from './application/verifyEmail'
export { makeAuthLimiters } from './infrastructure/authLimiters'
export { makeCleanupExpiredAuthRecords, startCleanupSchedule } from './infrastructure/cleanup'
export type { CleanupScheduleOptions } from './infrastructure/cleanup'
export type { AuthLimiters } from './infrastructure/authLimiters'
export { makePasswordHasher } from './infrastructure/passwordHasher'
export { makePendingRegistrationRepository } from './infrastructure/pendingRegistrationRepository'
export { makeRefreshTokenRepository } from './infrastructure/refreshTokenRepository'
export { makeTeacherRepository } from './infrastructure/teacherRepository'
export { makeTokenService } from './infrastructure/tokenService'
export { makeUnconfiguredEmailSender } from './infrastructure/unconfiguredEmailSender'
export { PRODUCTION_LIMITS } from './limits'
export type { AuthLimits, RateLimit } from './limits'
export { AUTH_ROUTES_BASE_PATH, makeAuthRouter } from './presentation/authRoutes'
export type { AuthRouterDeps } from './presentation/authRoutes'
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
