import type { LoginInput } from '@nataskium/shared/schemas'
import { AppError, RateLimitedError } from '../../../shared/errors'
import type { AuthSession, FailureLimiter, PasswordHasher, TeacherAccount, TeacherRepository } from '../types'
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
}

export function makeLogin(deps: LoginDeps) {
  return async function login(input: LoginInput): Promise<AuthSession> {
    // Перегрузка — до резерва: 503 не должен тратить лимит неудач учителя
    deps.hasher.assertCapacity()
    // Резерв до сверки пароля: параллельные попытки не проскочат лимит, пока идёт argon2
    const reservation = deps.failureLimiter.reserve(input.email)
    if (!reservation.allowed) throw new RateLimitedError(reservation.retryAfterSeconds)

    let isPasswordValid: boolean
    let teacher: TeacherAccount | null
    try {
      teacher = await deps.teachers.findByEmail(input.email)
      // Без учителя или пароля (вход только через Google) — сверка с dummy-хэшем за то же время
      isPasswordValid = await deps.hasher.verify(teacher?.passwordHash ?? null, input.password)
    } catch (error) {
      // Сбой базы или 503 очереди — не неудачная попытка
      reservation.release()
      throw error
    }

    // Резерв не снимается: любая из этих причин — неудачная попытка
    if (teacher === null || !isPasswordValid || teacher.emailVerifiedAt === null) {
      throw new AppError(UNAUTHORIZED_STATUS, INVALID_LOGIN_MESSAGE)
    }

    reservation.release()
    return issueSession(deps, teacher)
  }
}
