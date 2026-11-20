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
  // Неудачи входа с «знакомого устройства» (cookie выдана после успешного входа): отдельный счётчик, чужие неверные
  // пароли по email такому учителю вход не блокируют
  loginFailuresPerDevice: RateLimit
  // Неудачи вошедшего учителя при смене пароля и удалении аккаунта; ключ — id учителя, а не email
  accountFailuresPerTeacher: RateLimit
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
  // Запуск удаления аккаунта через Google: запись в базе и редирект на Google на каждую попытку
  googleReauthStartPerIp: RateLimit
  // Удаление аккаунта: сверка argon2 на каждую попытку, поэтому строже входа
  deleteAccountPerIp: RateLimit
  // Смена пароля: сверка и хэширование argon2 на каждую попытку
  changePasswordPerIp: RateLimit
  // refresh, logout, logout-all
  sessionPerIp: RateLimit
  // GET /me: дешёвая проверка JWT; лимит широкий, чтобы школьный NAT не блокировал учителей, и нужен только против флуда
  mePerIp: RateLimit
}

const MS_PER_MINUTE = 60 * 1000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR
const FIFTEEN_MINUTES_MS = 15 * MS_PER_MINUTE

const MAX_TRACKED_KEYS = 100_000
const LOGIN_PER_IP = 100
const LOGIN_PER_IP_EMAIL = 10
const LOGIN_FAILURES_PER_EMAIL = 10
const LOGIN_FAILURES_PER_DEVICE = 10
const ACCOUNT_FAILURES_PER_TEACHER = 10
const REGISTER_PER_IP = 30
const VERIFY_EMAIL_PER_IP = 30
const REGISTRATION_EMAILS_PER_HOUR = 3
const REGISTRATION_EMAILS_PER_DAY = 5
const SESSION_PER_IP = 60
const ME_PER_IP = 300
const RESET_EMAILS_PER_HOUR = 3
const RESET_EMAILS_PER_DAY = 5
const FORGOT_PASSWORD_PER_IP = 30
const RESET_PASSWORD_PER_IP = 30
const GOOGLE_START_PER_IP = 30
const GOOGLE_CALLBACK_PER_IP = 30
const GOOGLE_LINK_PER_IP = 30
const GOOGLE_REAUTH_START_PER_IP = 10
const DELETE_ACCOUNT_PER_IP = 10
const CHANGE_PASSWORD_PER_IP = 10

export const PRODUCTION_LIMITS: AuthLimits = {
  maxTrackedKeys: MAX_TRACKED_KEYS,
  loginPerIp: { max: LOGIN_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  loginPerIpEmail: { max: LOGIN_PER_IP_EMAIL, windowMs: FIFTEEN_MINUTES_MS },
  loginFailuresPerEmail: { max: LOGIN_FAILURES_PER_EMAIL, windowMs: FIFTEEN_MINUTES_MS },
  loginFailuresPerDevice: { max: LOGIN_FAILURES_PER_DEVICE, windowMs: FIFTEEN_MINUTES_MS },
  accountFailuresPerTeacher: { max: ACCOUNT_FAILURES_PER_TEACHER, windowMs: FIFTEEN_MINUTES_MS },
  registerPerIp: { max: REGISTER_PER_IP, windowMs: MS_PER_HOUR },
  verifyEmailPerIp: { max: VERIFY_EMAIL_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  registrationEmailsPerHour: { max: REGISTRATION_EMAILS_PER_HOUR, windowMs: MS_PER_HOUR },
  registrationEmailsPerDay: { max: REGISTRATION_EMAILS_PER_DAY, windowMs: MS_PER_DAY },
  sessionPerIp: { max: SESSION_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  mePerIp: { max: ME_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  resetEmailsPerHour: { max: RESET_EMAILS_PER_HOUR, windowMs: MS_PER_HOUR },
  resetEmailsPerDay: { max: RESET_EMAILS_PER_DAY, windowMs: MS_PER_DAY },
  forgotPasswordPerIp: { max: FORGOT_PASSWORD_PER_IP, windowMs: MS_PER_HOUR },
  resetPasswordPerIp: { max: RESET_PASSWORD_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  googleStartPerIp: { max: GOOGLE_START_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  googleCallbackPerIp: { max: GOOGLE_CALLBACK_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  googleLinkPerIp: { max: GOOGLE_LINK_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  googleReauthStartPerIp: { max: GOOGLE_REAUTH_START_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  deleteAccountPerIp: { max: DELETE_ACCOUNT_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
  changePasswordPerIp: { max: CHANGE_PASSWORD_PER_IP, windowMs: FIFTEEN_MINUTES_MS },
}
