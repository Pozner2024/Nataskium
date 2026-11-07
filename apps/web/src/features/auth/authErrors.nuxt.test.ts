import { describe, expect, it } from 'vitest'
import { ApiError, NETWORK_ERROR_STATUS } from '@/shared'
import { type AuthFormContext, authErrorMessages, emptyFieldErrors, googleErrorMessage, issuesToFormErrors } from '@/features/auth'

const CONTEXTS: AuthFormContext[] = ['login', 'register', 'verifyEmail', 'googleLink', 'forgotPassword', 'resetPassword']
const UNKNOWN = 'Что-то пошло не так. Попробуйте ещё раз'

describe('authErrorMessages: один текст на «отказ» без подсказки, что именно не так', () => {
  it.each(CONTEXTS)('%s: 400 без issues и 401 — один и тот же текст формы', (context) => {
    const badRequest = authErrorMessages(context, new ApiError(400))
    const unauthorized = authErrorMessages(context, new ApiError(401))

    expect(badRequest).toEqual(unauthorized)
    expect(badRequest.formError).toBeTruthy()
    expect(badRequest.fieldErrors).toEqual({})
  })

  it.each([
    ['resetPassword', 'Ссылка недействительна или устарела. Запросите новую'],
    ['forgotPassword', 'Не удалось отправить ссылку. Проверьте почту и попробуйте ещё раз'],
  ] as const)('%s: 400 — «%s»', (context, text) => {
    expect(authErrorMessages(context, new ApiError(400)).formError).toBe(text)
  })

  it('resetPassword: ошибка токена в issues — общая ошибка формы про ссылку', () => {
    expect(issuesToFormErrors('resetPassword', [{ path: ['token'], message: 'Invalid token' }]).formError).toBe(
      'Ссылка недействительна или устарела. Запросите новую',
    )
  })

  it('вход — «Неверная почта или пароль»', () => {
    expect(authErrorMessages('login', new ApiError(401)).formError).toBe('Неверная почта или пароль')
  })

  it.each([
    ['verifyEmail', 'Аккаунт с этой почтой уже есть — войдите'],
    ['googleLink', 'Этот аккаунт Google нельзя связать с вашим аккаунтом'],
    ['login', UNKNOWN],
    ['register', UNKNOWN],
  ] as const)('409 в %s — %s', (context, text) => {
    expect(authErrorMessages(context, new ApiError(409)).formError).toBe(text)
  })

  it.each([
    [60, 1],
    [61, 2],
    [1, 1],
    [900, 15],
  ])('429 с Retry-After %i с — «через %i мин.»', (seconds, minutes) => {
    expect(authErrorMessages('login', new ApiError(429, [], seconds)).formError).toBe(`Слишком много попыток. Попробуйте через ${minutes} мин.`)
  })

  it('429 без Retry-After — «попробуйте позже»', () => {
    expect(authErrorMessages('login', new ApiError(429)).formError).toBe('Слишком много попыток. Попробуйте позже')
  })

  it('503 — сервер занят', () => {
    expect(authErrorMessages('login', new ApiError(503)).formError).toBe('Сервер сейчас занят. Попробуйте через минуту')
  })

  it('сеть или неверный формат ответа (статус 0) — нет связи', () => {
    expect(authErrorMessages('register', new ApiError(NETWORK_ERROR_STATUS)).formError).toBe('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз')
  })

  it.each([
    ['500', new ApiError(500)],
    ['403', new ApiError(403)],
    ['не ApiError', new Error('boom')],
    ['строка', 'boom'],
  ])('%s — общий текст', (_name, error) => {
    expect(authErrorMessages('login', error)).toEqual({ formError: UNKNOWN, fieldErrors: {} })
  })

  it('400 с issues — ошибки у полей, а не у формы', () => {
    const errors = authErrorMessages('register', new ApiError(400, [{ path: ['email'], message: 'Invalid email' }]))

    expect(errors).toEqual({ formError: undefined, fieldErrors: { email: 'Проверьте адрес почты: например, name@school.ru' } })
  })
})

describe('issuesToFormErrors: словарь сообщений схем', () => {
  it.each([
    ['email', 'Email must use only Latin letters, digits and symbols before @', 'До @ — только латинские буквы, цифры и символы'],
    ['email', 'Email must be at most 254 characters', 'Слишком длинный адрес почты'],
    ['email', 'Email must have at most 64 characters before @', 'Слишком длинная часть адреса до @'],
    ['email', 'Invalid email', 'Проверьте адрес почты: например, name@school.ru'],
    ['password', 'Password is required', 'Введите пароль'],
    ['password', 'Password must be at least 4 characters', 'Пароль — не короче 4 символов'],
    ['password', 'Password must be at most 128 characters', 'Пароль — не длиннее 128 символов'],
    ['password', 'Password is too common', 'Этот пароль слишком простой — придумайте другой'],
    ['password', 'Password contains invalid characters', 'В пароле есть недопустимые символы'],
    ['displayName', 'Display name must be at most 100 characters', 'Имя — не длиннее 100 символов'],
    ['displayName', 'Display name contains invalid characters', 'В имени есть недопустимые символы'],
  ])('%s: %s', (field, message, text) => {
    expect(issuesToFormErrors('register', [{ path: [field], message }]).fieldErrors).toEqual({ [field]: text })
  })

  it.each([
    ['email', 'Проверьте адрес почты'],
    ['password', 'Проверьте пароль'],
    ['displayName', 'Проверьте имя'],
  ])('неизвестное сообщение для %s — общий текст поля, английский текст не показывается', (field, text) => {
    const errors = issuesToFormErrors('register', [{ path: [field], message: 'Something new from the server' }])

    expect(errors.fieldErrors).toEqual({ [field]: text })
  })

  it('у поля — только первая ошибка', () => {
    const errors = issuesToFormErrors('register', [
      { path: ['password'], message: 'Password must be at least 4 characters' },
      { path: ['password'], message: 'Password is too common' },
    ])

    expect(errors.fieldErrors).toEqual({ password: 'Пароль — не короче 4 символов' })
  })

  it.each([
    ['token', ['token']],
    ['пустой путь', []],
    ['неизвестное поле', ['role']],
  ])('ошибка вне полей формы (%s) — общая ошибка формы', (_name, path) => {
    const errors = issuesToFormErrors('verifyEmail', [{ path, message: 'Invalid token' }])

    expect(errors).toEqual({ formError: 'Ссылка недействительна или устарела, или пароль неверный', fieldErrors: {} })
  })
})

describe('emptyFieldErrors', () => {
  it('пустые и из пробелов почта и пароль — «Введите…»', () => {
    expect(emptyFieldErrors({ email: '   ', password: '' })).toEqual({ email: 'Введите почту', password: 'Введите пароль' })
  })

  it('заполненные поля и необязательное имя — без ошибок', () => {
    expect(emptyFieldErrors({ email: 'a@b.co', password: 'x', displayName: '' })).toEqual({})
  })

  it('поля, которых нет в форме, не проверяются', () => {
    expect(emptyFieldErrors({ password: '' })).toEqual({ password: 'Введите пароль' })
  })
})

describe('googleErrorMessage: ?error= после входа через Google', () => {
  it.each([
    ['google_cancelled', 'Вход через Google отменён'],
    ['google_state', 'Не удалось войти через Google. Начните заново'],
    ['google_unavailable', 'Google сейчас недоступен. Попробуйте позже или войдите по паролю'],
    ['google_failed', 'Не удалось войти через Google. Попробуйте ещё раз'],
    ['google_email_unverified', 'Почта в аккаунте Google не подтверждена'],
    ['google_account_conflict', 'К этой почте уже привязан другой аккаунт Google'],
  ])('%s', (code, text) => {
    expect(googleErrorMessage(code)).toBe(text)
  })

  // Код из адреса задаёт кто угодно: показываем только свои тексты
  it.each(['<script>alert(1)</script>', 'google_unknown', '', '__proto__', 'constructor'])('незнакомый код %j — общий текст Google', (code) => {
    expect(googleErrorMessage(code)).toBe('Не удалось войти через Google. Попробуйте ещё раз')
  })

  it.each([undefined, null, ['google_failed'], 42])('не строка (%j) — без сообщения', (code) => {
    expect(googleErrorMessage(code)).toBeUndefined()
  })
})
