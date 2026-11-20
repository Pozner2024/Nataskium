import type { LoginInput } from '@nataskium/shared/schemas'
import { AppError, RateLimitedError } from '../../../shared/errors'
import type { AuthSession, DeviceTrust, FailureLimiter, PasswordHasher, TeacherRepository } from '../types'
import { type IssueSessionDeps, issueSession } from './issueSession'

const UNAUTHORIZED_STATUS = 401
// Одно сообщение для «нет учителя», «только Google», «не подтверждён» и «неверный пароль»: по нему не понять,
// есть ли аккаунт с этим email
const INVALID_LOGIN_MESSAGE = 'Wrong email or password'

export type LoginDeps = IssueSessionDeps & {
  teachers: TeacherRepository
  hasher: PasswordHasher
  // Общий с подтверждением email лимит неудач по email
  failureLimiter: FailureLimiter
  deviceTrust: DeviceTrust
  // Неудачи с «знакомого устройства»: отдельно от счётчика email, чтобы чужие попытки не блокировали учителя
  deviceFailureLimiter: FailureLimiter
}

export type LoginResult = AuthSession & { deviceToken: string }

export function makeLogin(deps: LoginDeps) {
  return async function login(input: LoginInput, deviceToken?: string): Promise<LoginResult> {
    // Перегрузка — до резерва: 503 не должен тратить лимит неудач учителя
    deps.hasher.assertCapacity()
    // Учитель читается до резерва: подпись устройства привязана к его passwordHash. Сбой базы — просто ошибка
    const teacher = await deps.teachers.findByEmail(input.email)
    // Невалидная, чужая или отозванная (пароль сменён) cookie — то же, что её отсутствие
    const deviceKey = teacher?.passwordHash ? deps.deviceTrust.verify(input.email, teacher.passwordHash, deviceToken) : null
    // Резерв до сверки пароля: параллельные попытки не проскочат лимит, пока идёт argon2
    const reservation =
      deviceKey === null ? deps.failureLimiter.reserve(input.email) : deps.deviceFailureLimiter.reserve(deviceKey)
    if (!reservation.allowed) throw new RateLimitedError(reservation.retryAfterSeconds)

    let isPasswordValid: boolean
    try {
      // Без учителя или пароля (вход только через Google) — сверка с dummy-хэшем за то же время
      isPasswordValid = await deps.hasher.verify(teacher?.passwordHash ?? null, input.password)
    } catch (error) {
      // Сбой 503 очереди — не неудачная попытка
      reservation.release()
      throw error
    }

    // Резерв не снимается: любая из этих причин — неудачная попытка
    if (teacher === null || !isPasswordValid || teacher.passwordHash === null || teacher.emailVerifiedAt === null) {
      throw new AppError(UNAUTHORIZED_STATUS, INVALID_LOGIN_MESSAGE)
    }

    reservation.release()
    const session = await issueSession(deps, teacher)
    return { ...session, deviceToken: deps.deviceTrust.issue(input.email, teacher.passwordHash) }
  }
}
