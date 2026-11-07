// Лимиты auth (план 1.6). Числа — конфигурация createApp: src/index.ts всегда передаёт PRODUCTION_LIMITS,
// TEST_LIMITS передают только тесты. От NODE_ENV и переменных окружения лимиты не зависят

export type RateLimit = { max: number; windowMs: number }

export type AuthLimits = {
  maxTrackedKeys: number
  // Мягкий лимит по IP: за школьным NAT много учителей с одного адреса
  loginPerIp: RateLimit
  // Строгий: попытки входа одного email с одного адреса
  loginPerIpEmail: RateLimit
  // Только неудачные попытки по email, общий для входа и подтверждения email: против распределённого перебора
  loginFailuresPerEmail: RateLimit
  registerPerIp: RateLimit
  verifyEmailPerIp: RateLimit
  // Письма регистрации на адрес: подтверждение и «аккаунт уже есть»
  registrationEmailsPerHour: RateLimit
  registrationEmailsPerDay: RateLimit
  // Письма сброса на адрес — отдельный бюджет: спам регистрациями не блокирует учителю сброс
  resetEmailsPerHour: RateLimit
  resetEmailsPerDay: RateLimit
  forgotPasswordPerIp: RateLimit
  resetPasswordPerIp: RateLimit
  googleStartPerIp: RateLimit
  googleCallbackPerIp: RateLimit
  googleLinkPerIp: RateLimit
  // Удаление аккаунта: сверка argon2 на каждую попытку, поэтому строже входа
  deleteAccountPerIp: RateLimit
  // refresh, logout, logout-all
  sessionPerIp: RateLimit
}

const MS_PER_MINUTE = 60 * 1000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR
const FIFTEEN_MINUTES_MS = 15 * MS_PER_MINUTE

const MAX_TRACKED_KEYS = 100_000
const LOGIN_PER_IP = 100
const LOGIN_PER_IP_EMAIL = 10
const LOGIN_FAILURES_PER_EMAIL = 10
const REGISTER_PER_IP = 30
const VERIFY_EMAIL_PER_IP = 30
const REGISTRATION_EMAILS_PER_HOUR = 3
const REGISTRATION_EMAILS_PER_DAY = 5
const SESSION_PER_IP = 60
const RESET_EMAILS_PER_HOUR = 3
const RESET_EMAILS_PER_DAY = 5
const FORGOT_PASSWORD_PER_IP = 30
const RESET_PASSWORD_PER_IP = 30
const GOOGLE_START_PER_IP = 30
const GOOGLE_CALLBACK_PER_IP = 30
const GOOGLE_LINK_PER_IP = 30
const DELETE_ACCOUNT_PER_IP = 10

export const PRODUCTION_LIMITS: AuthLimits = {
  maxTrackedKeys: MAX_TRACKED_KEYS,
  loginPerIp: { max: LOGIN_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  loginPerIpEmail: { max: LOGIN_PER_IP_EMAIL, windowMs: FIFTEEN_MINUTES_MS },
  loginFailuresPerEmail: { max: LOGIN_FAILURES_PER_EMAIL, windowMs: FIFTEEN_MINUTES_MS },
  registerPerIp: { max: REGISTER_PER_IP, windowMs: MS_PER_HOUR },
  verifyEmailPerIp: { max: VERIFY_EMAIL_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  registrationEmailsPerHour: { max: REGISTRATION_EMAILS_PER_HOUR, windowMs: MS_PER_HOUR },
  registrationEmailsPerDay: { max: REGISTRATION_EMAILS_PER_DAY, windowMs: MS_PER_DAY },
  sessionPerIp: { max: SESSION_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  resetEmailsPerHour: { max: RESET_EMAILS_PER_HOUR, windowMs: MS_PER_HOUR },
  resetEmailsPerDay: { max: RESET_EMAILS_PER_DAY, windowMs: MS_PER_DAY },
  forgotPasswordPerIp: { max: FORGOT_PASSWORD_PER_IP, windowMs: MS_PER_HOUR },
  resetPasswordPerIp: { max: RESET_PASSWORD_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  googleStartPerIp: { max: GOOGLE_START_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  googleCallbackPerIp: { max: GOOGLE_CALLBACK_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  googleLinkPerIp: { max: GOOGLE_LINK_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  deleteAccountPerIp: { max: DELETE_ACCOUNT_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
}
