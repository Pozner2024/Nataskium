import { DEFAULT_LOCALE } from '@nataskium/shared/locales'
import type { ChangePasswordInput } from '@nataskium/shared/schemas'
import { AppError, RateLimitedError } from '../../../shared/errors'
import type { AuthSession, EmailSender, FailureLimiter, PasswordHasher, TeacherRepository } from '../types'
import { sessionInvalid } from './authErrors'
import { type IssueSessionDeps, issueSession } from './issueSession'
import { sendInBackground } from './sendInBackground'

const BAD_REQUEST_STATUS = 400
const CONFLICT_STATUS = 409
// 400, а не 401: на 401 фронтенд решил бы, что сессия истекла
const WRONG_PASSWORD_MESSAGE = 'Wrong password'
// Пароля нет — менять нечего: учитель входит через Google
const GOOGLE_ONLY_MESSAGE = 'This account signs in with Google and has no password'

export type ChangePasswordDeps = IssueSessionDeps & {
  teachers: TeacherRepository
  hasher: PasswordHasher
  // По id учителя, не по email: чужие неверные входы по email не блокируют вошедшему учителю эти действия
  failureLimiter: FailureLimiter
  emailSender: EmailSender
}

// Вошедший учитель меняет пароль, подтверждая текущим: украденного access-токена (живёт до 15 мин) для смены мало.
// Все прежние сессии удаляются, этому браузеру выдаётся новая
export function makeChangePassword(deps: ChangePasswordDeps) {
  return async function changePassword(teacherId: string, input: ChangePasswordInput): Promise<AuthSession> {
    const teacher = await deps.teachers.findById(teacherId)
    // Аккаунт удалён, а access-токен ещё жив: это конец сессии
    if (teacher === null) throw sessionInvalid()
    if (teacher.passwordHash === null) throw new AppError(CONFLICT_STATUS, GOOGLE_ONLY_MESSAGE)

    // Перегрузка — до резерва: 503 не должен тратить лимит неудач учителя
    deps.hasher.assertCapacity()
    const reservation = deps.failureLimiter.reserve(teacher.id)
    if (!reservation.allowed) throw new RateLimitedError(reservation.retryAfterSeconds)

    let isPasswordValid: boolean
    try {
      isPasswordValid = await deps.hasher.verify(teacher.passwordHash, input.currentPassword)
    } catch (error) {
      // Очередь заполнилась между проверкой и сверкой — это не неудачная попытка
      reservation.release()
      throw error
    }
    // Резерв не снимается: неверный пароль — неудачная попытка
    if (!isPasswordValid) throw new AppError(BAD_REQUEST_STATUS, WRONG_PASSWORD_MESSAGE)
    reservation.release()

    // Новый пароль уже прошёл passwordSchema (NFC, минимум, блок-лист): хэшируется результат разбора
    const passwordHash = await deps.hasher.hash(input.newPassword)
    const changed = await deps.teachers.changePassword(teacher.id, teacher.passwordHash, passwordHash)
    // Параллельный запрос успел удалить аккаунт или пароль сменили, пока шла сверка: сброс и смена пароля
    // уже завершили все сессии
    if (!changed) throw sessionInvalid()

    const session = await issueSession(deps, { ...teacher, passwordHash })
    const { email, displayName } = teacher
    sendInBackground('changePassword.changed', () => deps.emailSender.sendPasswordChangedEmail(email, displayName, input.locale ?? DEFAULT_LOCALE))
    return session
  }
}
