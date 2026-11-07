export { MAX_ACTIVE_SESSIONS, REFRESH_TOKEN_TTL_MS, SESSION_ABSOLUTE_TTL_MS } from './application/issueSession'
export { makeDeleteAccount } from './application/deleteAccount'
export { makeGetMe } from './application/getMe'
export { GOOGLE_LINK_TTL_MS, makeGoogleSignIn } from './application/googleAuth'
export { makeGoogleLink } from './application/googleLink'
export type { GoogleSignInOutcome } from './application/googleAuth'
export { makeLogin } from './application/login'
export { makeLogout } from './application/logout'
export { makeLogoutAll } from './application/logoutAll'
export { MIN_REMAINING_SESSION_MS, makeRefreshSession } from './application/refreshSession'
export { PENDING_REGISTRATION_TTL_MS, makeRegister } from './application/register'
export { PASSWORD_RESET_TTL_MS, makeRequestPasswordReset } from './application/requestPasswordReset'
export { makeResetPassword } from './application/resetPassword'
export { makeVerifyEmail } from './application/verifyEmail'
export { makeAuthLimiters } from './infrastructure/authLimiters'
export { makeCleanupExpiredAuthRecords, startCleanupSchedule } from './infrastructure/cleanup'
export { makeResendEmailSender } from './infrastructure/emailService'
export { makeGoogleClient } from './infrastructure/googleClient'
export { GOOGLE_SIGN_IN_DONE_PATH, LINK_GOOGLE_PATH, RESET_PASSWORD_PATH, SIGN_IN_PATH, VERIFY_EMAIL_PATH } from './webPaths'
export type { CleanupScheduleOptions } from './infrastructure/cleanup'
export type { AuthLimiters } from './infrastructure/authLimiters'
export { makePasswordHasher } from './infrastructure/passwordHasher'
export { makePasswordResetRepository } from './infrastructure/passwordResetRepository'
export { makePendingGoogleLinkRepository } from './infrastructure/pendingGoogleLinkRepository'
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
  GoogleIdentityProvider,
  PasswordHasher,
  PendingRegistrationRepository,
  RefreshTokenRepository,
  TeacherRepository,
  TeacherView,
  TokenService,
} from './types'
