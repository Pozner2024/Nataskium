import { DISPLAY_NAME_MAX_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@nataskium/shared/schemas'
import { ApiError, type ApiIssue, NETWORK_ERROR_STATUS } from '@/shared'

export type AuthFormContext = 'login' | 'register' | 'verifyEmail' | 'googleLink' | 'forgotPassword' | 'resetPassword'
export type AuthFieldName = 'displayName' | 'email' | 'password'

export type AuthFormErrors = {
  formError?: string
  fieldErrors: Partial<Record<AuthFieldName, string>>
}

// Переводчик текущего языка: функции этого файла чистые, язык им передаёт вызывающий
export type Translate = (key: string, params?: Record<string, unknown>) => string

const BAD_REQUEST_STATUS = 400
const UNAUTHORIZED_STATUS = 401
const CONFLICT_STATUS = 409
const TOO_MANY_REQUESTS_STATUS = 429
const SERVICE_UNAVAILABLE_STATUS = 503
const SECONDS_PER_MINUTE = 60

// API отвечает одинаково на разные причины отказа (нет учителя, неверный пароль, неверная ссылка):
// здесь тоже один текст на такой ответ, без подсказки, что именно не так
const REJECTED_MESSAGE_KEYS: Record<AuthFormContext, string> = {
  login: 'auth.errors.rejected.login',
  register: 'auth.errors.rejected.register',
  verifyEmail: 'auth.errors.rejected.verifyEmail',
  googleLink: 'auth.errors.rejected.googleLink',
  forgotPassword: 'auth.errors.rejected.forgotPassword',
  resetPassword: 'auth.errors.rejected.resetPassword',
}

const CONFLICT_MESSAGE_KEYS: Partial<Record<AuthFormContext, string>> = {
  verifyEmail: 'auth.errors.conflict.verifyEmail',
  googleLink: 'auth.errors.conflict.googleLink',
}

const NETWORK_MESSAGE_KEY = 'auth.errors.network'
const BUSY_MESSAGE_KEY = 'auth.errors.busy'
const UNKNOWN_MESSAGE_KEY = 'auth.errors.unknown'

// Сообщения схем из @nataskium/shared (английские и одинаковые на сервере и в браузере) → текст у поля на языке интерфейса
const ISSUE_MESSAGES: { prefix: string; key: string; params?: Record<string, unknown> }[] = [
  { prefix: 'Email must use only Latin letters', key: 'auth.errors.issue.emailLatin' },
  { prefix: 'Email must be at most', key: 'auth.errors.issue.emailTooLong' },
  { prefix: 'Email must have at most', key: 'auth.errors.issue.emailLocalTooLong' },
  { prefix: 'Invalid email', key: 'auth.errors.issue.emailInvalid' },
  { prefix: 'Password is required', key: 'auth.errors.issue.passwordRequired' },
  { prefix: 'Password must be at least', key: 'auth.errors.issue.passwordMin', params: { min: MIN_PASSWORD_LENGTH } },
  { prefix: 'Password must be at most', key: 'auth.errors.issue.passwordMax', params: { max: MAX_PASSWORD_LENGTH } },
  { prefix: 'Password is too common', key: 'auth.errors.issue.passwordCommon' },
  { prefix: 'Password contains invalid characters', key: 'auth.errors.issue.passwordChars' },
  { prefix: 'Display name must be at most', key: 'auth.errors.issue.nameMax', params: { max: DISPLAY_NAME_MAX_LENGTH } },
  { prefix: 'Display name contains invalid characters', key: 'auth.errors.issue.nameChars' },
]

const FIELD_FALLBACK_KEYS: Record<AuthFieldName, string> = {
  displayName: 'auth.errors.field.displayName',
  email: 'auth.errors.field.email',
  password: 'auth.errors.field.password',
}

const EMPTY_FIELD_MESSAGE_KEYS: Partial<Record<AuthFieldName, string>> = {
  email: 'auth.errors.empty.email',
  password: 'auth.errors.empty.password',
}

function isFieldName(value: string | undefined): value is AuthFieldName {
  return value === 'displayName' || value === 'email' || value === 'password'
}

function translateIssue(t: Translate, field: AuthFieldName, message: string): string {
  const entry = ISSUE_MESSAGES.find((each) => message.startsWith(each.prefix))
  return entry === undefined ? t(FIELD_FALLBACK_KEYS[field]) : t(entry.key, entry.params)
}

// Первая ошибка каждого поля. Ошибки токена ссылки (поле token) — общая ошибка формы
export function issuesToFormErrors(t: Translate, context: AuthFormContext, issues: readonly ApiIssue[]): AuthFormErrors {
  const fieldErrors: AuthFormErrors['fieldErrors'] = {}
  let formError: string | undefined
  for (const issue of issues) {
    const field = issue.path[0]
    if (!isFieldName(field)) {
      formError ??= t(REJECTED_MESSAGE_KEYS[context])
      continue
    }
    fieldErrors[field] ??= translateIssue(t, field, issue.message)
  }
  return { formError, fieldErrors }
}

// Пустые обязательные поля — понятнее, чем «проверьте адрес»
export function emptyFieldErrors(t: Translate, values: Partial<Record<AuthFieldName, string>>): AuthFormErrors['fieldErrors'] {
  const errors: AuthFormErrors['fieldErrors'] = {}
  for (const [field, key] of Object.entries(EMPTY_FIELD_MESSAGE_KEYS)) {
    if (isFieldName(field) && values[field] !== undefined && values[field]?.trim() === '') errors[field] = t(key)
  }
  return errors
}

function retryText(t: Translate, retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null) return t('auth.errors.retryLater')
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE))
  return t('auth.errors.retry', { minutes })
}

// Текст API не показываем: он английский и намеренно общий. Выбираем текст на языке интерфейса по статусу и форме
export function authErrorMessages(t: Translate, context: AuthFormContext, error: unknown): AuthFormErrors {
  if (!(error instanceof ApiError)) return { formError: t(UNKNOWN_MESSAGE_KEY), fieldErrors: {} }

  if (error.status === BAD_REQUEST_STATUS && error.issues.length > 0) return issuesToFormErrors(t, context, error.issues)
  if (error.status === BAD_REQUEST_STATUS || error.status === UNAUTHORIZED_STATUS) {
    return { formError: t(REJECTED_MESSAGE_KEYS[context]), fieldErrors: {} }
  }
  if (error.status === CONFLICT_STATUS) {
    return { formError: t(CONFLICT_MESSAGE_KEYS[context] ?? UNKNOWN_MESSAGE_KEY), fieldErrors: {} }
  }
  if (error.status === TOO_MANY_REQUESTS_STATUS) return { formError: retryText(t, error.retryAfterSeconds), fieldErrors: {} }
  if (error.status === SERVICE_UNAVAILABLE_STATUS) return { formError: t(BUSY_MESSAGE_KEY), fieldErrors: {} }
  if (error.status === NETWORK_ERROR_STATUS) return { formError: t(NETWORK_MESSAGE_KEY), fieldErrors: {} }
  return { formError: t(UNKNOWN_MESSAGE_KEY), fieldErrors: {} }
}

// Коды ?error= после редиректа API из входа через Google
const GOOGLE_FALLBACK_KEY = 'auth.errors.google.failed'
// Map, а не объект: код приходит из адреса, и ?error=__proto__ или constructor не должны найти свойство прототипа
const GOOGLE_ERROR_KEYS = new Map<string, string>(Object.entries({
  google_cancelled: 'auth.errors.google.cancelled',
  google_state: 'auth.errors.google.state',
  google_unavailable: 'auth.errors.google.unavailable',
  google_failed: GOOGLE_FALLBACK_KEY,
  google_email_unverified: 'auth.errors.google.emailUnverified',
  google_account_conflict: 'auth.errors.google.accountConflict',
}))

export function googleErrorMessage(t: Translate, code: unknown): string | undefined {
  if (typeof code !== 'string') return undefined
  return t(GOOGLE_ERROR_KEYS.get(code) ?? GOOGLE_FALLBACK_KEY)
}
