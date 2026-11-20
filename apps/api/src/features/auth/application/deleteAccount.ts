import { DEFAULT_LOCALE } from '@nataskium/shared/locales'
import type { DeleteAccountInput } from '@nataskium/shared/schemas'
import { AppError, RateLimitedError } from '../../../shared/errors'
import type { EmailSender, FailureLimiter, PasswordHasher, TeacherImageFiles, TeacherRepository } from '../types'
import { sessionInvalid } from './authErrors'
import { sendInBackground } from './sendInBackground'
import { collectTeacherImageIds, removeTeacherImageFiles } from './teacherImages'

const BAD_REQUEST_STATUS = 400
const CONFLICT_STATUS = 409
// 400, а не 401: на 401 фронтенд решил бы, что сессия истекла
const WRONG_PASSWORD_MESSAGE = 'Wrong password'
// Пароля нет — здесь подтвердить удаление нечем: такой аккаунт удаляется повторным входом в Google
// (POST /google/reauth/start)
const GOOGLE_ONLY_MESSAGE = 'Accounts without a password are deleted by signing in with Google'

export type DeleteAccountDeps = {
  teachers: TeacherRepository
  hasher: PasswordHasher
  // По id учителя, не по email: чужие неверные входы по email не блокируют вошедшему учителю эти действия
  failureLimiter: FailureLimiter
  emailSender: EmailSender
  // Не задано или null — хранилище картинок не настроено: файлов нет
  imageFiles?: TeacherImageFiles | null
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
    const reservation = deps.failureLimiter.reserve(teacher.id)
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

    const imageIds = await collectTeacherImageIds(deps.imageFiles, teacher.id)
    const deleted = await deps.teachers.deleteAccount(teacher.id, teacher.email)
    // Параллельный запрос успел удалить аккаунт раньше — и сам удалит файлы
    if (!deleted) throw sessionInvalid()
    await removeTeacherImageFiles(deps.imageFiles, imageIds)

    // Только teacherId: email удалённого учителя в логах не остаётся
    console.info('Teacher account deleted', { teacherId: teacher.id })
    // Адрес и имя — из записи, прочитанной до удаления. Сбой отправки удаление не откатывает
    const { email, displayName } = teacher
    sendInBackground('account.deleted', () => deps.emailSender.sendAccountDeletedEmail(email, displayName, input.locale ?? DEFAULT_LOCALE))
  }
}
