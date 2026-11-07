import type { DeleteAccountInput } from '@nataskium/shared/schemas'
import { AppError, RateLimitedError } from '../../../shared/errors'
import type { FailureLimiter, PasswordHasher, TeacherRepository } from '../types'
import { sessionInvalid } from './authErrors'

const BAD_REQUEST_STATUS = 400
const CONFLICT_STATUS = 409
// 400, а не 401: на 401 фронтенд решил бы, что сессия истекла
const WRONG_PASSWORD_MESSAGE = 'Wrong password'
// Пароля нет — подтвердить удаление нечем. Подтверждение по почте для всех учителей — следующий шаг (план, раздел 6)
const GOOGLE_ONLY_MESSAGE = 'Accounts created with Google can be deleted through support for now'

export type DeleteAccountDeps = {
  teachers: TeacherRepository
  hasher: PasswordHasher
  // Общий с входом лимит неудач по email: удаление не даёт второго канала перебора пароля
  failureLimiter: FailureLimiter
}

// Учитель удаляет свой аккаунт сам (GDPR): физически, вместе со всеми сессиями и данными. Подтверждение — текущий
// пароль: украденного access-токена (живёт до 15 мин) для удаления мало
export function makeDeleteAccount(deps: DeleteAccountDeps) {
  return async function deleteAccount(teacherId: string, input: DeleteAccountInput): Promise<void> {
    const teacher = await deps.teachers.findById(teacherId)
    // Аккаунт уже удалён, а access-токен ещё жив: это конец сессии
    if (teacher === null) throw sessionInvalid()
    if (teacher.passwordHash === null) throw new AppError(CONFLICT_STATUS, GOOGLE_ONLY_MESSAGE)

    // Перегрузка — до резерва: 503 не должен тратить лимит неудач учителя
    deps.hasher.assertCapacity()
    const reservation = deps.failureLimiter.reserve(teacher.email)
    if (!reservation.allowed) throw new RateLimitedError(reservation.retryAfterSeconds)

    let isPasswordValid: boolean
    try {
      isPasswordValid = await deps.hasher.verify(teacher.passwordHash, input.password)
    } catch (error) {
      // Очередь заполнилась между проверкой и сверкой — это не неудачная попытка
      reservation.release()
      throw error
    }
    // Резерв не снимается: неверный пароль — неудачная попытка
    if (!isPasswordValid) throw new AppError(BAD_REQUEST_STATUS, WRONG_PASSWORD_MESSAGE)
    reservation.release()

    const deleted = await deps.teachers.deleteAccount(teacher.id, teacher.email)
    // Параллельный запрос успел удалить аккаунт раньше
    if (!deleted) throw sessionInvalid()

    // Только teacherId: email удалённого учителя в логах не остаётся
    console.info('Teacher account deleted', { teacherId: teacher.id })
  }
}
