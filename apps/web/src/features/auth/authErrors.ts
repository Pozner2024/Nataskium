import { DISPLAY_NAME_MAX_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@nataskium/shared/schemas'
import { ApiError, type ApiIssue, NETWORK_ERROR_STATUS } from '@/shared'

export type AuthFormContext = 'login' | 'register' | 'verifyEmail' | 'googleLink' | 'forgotPassword' | 'resetPassword'
export type AuthFieldName = 'displayName' | 'email' | 'password'

export type AuthFormErrors = {
  formError?: string
  fieldErrors: Partial<Record<AuthFieldName, string>>
}

const BAD_REQUEST_STATUS = 400
const UNAUTHORIZED_STATUS = 401
const CONFLICT_STATUS = 409
const TOO_MANY_REQUESTS_STATUS = 429
const SERVICE_UNAVAILABLE_STATUS = 503
const SECONDS_PER_MINUTE = 60

// API отвечает одинаково на разные причины отказа (нет учителя, неверный пароль, неверная ссылка):
// здесь тоже один текст на такой ответ, без подсказки, что именно не так
const REJECTED_MESSAGES: Record<AuthFormContext, string> = {
  login: 'Неверная почта или пароль',
  register: 'Не удалось зарегистрироваться. Проверьте данные и попробуйте ещё раз',
  verifyEmail: 'Ссылка недействительна или устарела, или пароль неверный',
  googleLink: 'Неверный пароль или ссылка устарела. Попробуйте войти через Google ещё раз',
  forgotPassword: 'Не удалось отправить ссылку. Проверьте почту и попробуйте ещё раз',
  resetPassword: 'Ссылка недействительна или устарела. Запросите новую',
}

const CONFLICT_MESSAGES: Partial<Record<AuthFormContext, string>> = {
  verifyEmail: 'Аккаунт с этой почтой уже есть — войдите',
  googleLink: 'Этот аккаунт Google нельзя связать с вашим аккаунтом',
}

const NETWORK_MESSAGE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз'
const BUSY_MESSAGE = 'Сервер сейчас занят. Попробуйте через минуту'
const UNKNOWN_MESSAGE = 'Что-то пошло не так. Попробуйте ещё раз'

// Сообщения схем из @nataskium/shared (одинаковые на сервере и в браузере) → русский текст у поля
const ISSUE_MESSAGES: { prefix: string; text: string }[] = [
  { prefix: 'Email must use only Latin letters', text: 'До @ — только латинские буквы, цифры и символы' },
  { prefix: 'Email must be at most', text: 'Слишком длинный адрес почты' },
  { prefix: 'Email must have at most', text: 'Слишком длинная часть адреса до @' },
  { prefix: 'Invalid email', text: 'Проверьте адрес почты: например, name@school.ru' },
  { prefix: 'Password is required', text: 'Введите пароль' },
  { prefix: 'Password must be at least', text: `Пароль — не короче ${MIN_PASSWORD_LENGTH} символов` },
  { prefix: 'Password must be at most', text: `Пароль — не длиннее ${MAX_PASSWORD_LENGTH} символов` },
  { prefix: 'Password is too common', text: 'Этот пароль слишком простой — придумайте другой' },
  { prefix: 'Password contains invalid characters', text: 'В пароле есть недопустимые символы' },
  { prefix: 'Display name must be at most', text: `Имя — не длиннее ${DISPLAY_NAME_MAX_LENGTH} символов` },
  { prefix: 'Display name contains invalid characters', text: 'В имени есть недопустимые символы' },
]

const FIELD_FALLBACKS: Record<AuthFieldName, string> = {
  displayName: 'Проверьте имя',
  email: 'Проверьте адрес почты',
  password: 'Проверьте пароль',
}

const EMPTY_FIELD_MESSAGES: Partial<Record<AuthFieldName, string>> = {
  email: 'Введите почту',
  password: 'Введите пароль',
}

function isFieldName(value: string | undefined): value is AuthFieldName {
  return value === 'displayName' || value === 'email' || value === 'password'
}

function translateIssue(field: AuthFieldName, message: string): string {
  return ISSUE_MESSAGES.find((entry) => message.startsWith(entry.prefix))?.text ?? FIELD_FALLBACKS[field]
}

// Первая ошибка каждого поля. Ошибки токена ссылки (поле token) — общая ошибка формы
export function issuesToFormErrors(context: AuthFormContext, issues: readonly ApiIssue[]): AuthFormErrors {
  const fieldErrors: AuthFormErrors['fieldErrors'] = {}
  let formError: string | undefined
  for (const issue of issues) {
    const field = issue.path[0]
    if (!isFieldName(field)) {
      formError ??= REJECTED_MESSAGES[context]
      continue
    }
    fieldErrors[field] ??= translateIssue(field, issue.message)
  }
  return { formError, fieldErrors }
}

// Пустые обязательные поля — понятнее, чем «проверьте адрес»
export function emptyFieldErrors(values: Partial<Record<AuthFieldName, string>>): AuthFormErrors['fieldErrors'] {
  const errors: AuthFormErrors['fieldErrors'] = {}
  for (const [field, message] of Object.entries(EMPTY_FIELD_MESSAGES)) {
    if (isFieldName(field) && values[field] !== undefined && values[field]?.trim() === '') errors[field] = message
  }
  return errors
}

function retryText(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null) return 'Слишком много попыток. Попробуйте позже'
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE))
  return `Слишком много попыток. Попробуйте через ${minutes} мин.`
}

// Текст API не показываем: он английский и намеренно общий. Выбираем русский по статусу и форме
export function authErrorMessages(context: AuthFormContext, error: unknown): AuthFormErrors {
  if (!(error instanceof ApiError)) return { formError: UNKNOWN_MESSAGE, fieldErrors: {} }

  if (error.status === BAD_REQUEST_STATUS && error.issues.length > 0) return issuesToFormErrors(context, error.issues)
  if (error.status === BAD_REQUEST_STATUS || error.status === UNAUTHORIZED_STATUS) {
    return { formError: REJECTED_MESSAGES[context], fieldErrors: {} }
  }
  if (error.status === CONFLICT_STATUS) {
    return { formError: CONFLICT_MESSAGES[context] ?? UNKNOWN_MESSAGE, fieldErrors: {} }
  }
  if (error.status === TOO_MANY_REQUESTS_STATUS) return { formError: retryText(error.retryAfterSeconds), fieldErrors: {} }
  if (error.status === SERVICE_UNAVAILABLE_STATUS) return { formError: BUSY_MESSAGE, fieldErrors: {} }
  if (error.status === NETWORK_ERROR_STATUS) return { formError: NETWORK_MESSAGE, fieldErrors: {} }
  return { formError: UNKNOWN_MESSAGE, fieldErrors: {} }
}

// Коды ?error= после редиректа API из входа через Google
const GOOGLE_FALLBACK_MESSAGE = 'Не удалось войти через Google. Попробуйте ещё раз'
// Map, а не объект: код приходит из адреса, и ?error=__proto__ или constructor не должны найти свойство прототипа
const GOOGLE_ERROR_MESSAGES = new Map<string, string>(Object.entries({
  google_cancelled: 'Вход через Google отменён',
  google_state: 'Не удалось войти через Google. Начните заново',
  google_unavailable: 'Google сейчас недоступен. Попробуйте позже или войдите по паролю',
  google_failed: GOOGLE_FALLBACK_MESSAGE,
  google_email_unverified: 'Почта в аккаунте Google не подтверждена',
  google_account_conflict: 'К этой почте уже привязан другой аккаунт Google',
}))

export function googleErrorMessage(code: unknown): string | undefined {
  if (typeof code !== 'string') return undefined
  return GOOGLE_ERROR_MESSAGES.get(code) ?? GOOGLE_FALLBACK_MESSAGE
}
