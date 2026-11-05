import type { VerifyEmailInput } from '@nataskium/shared/schemas'
import { AppError, RateLimitedError } from '../../../shared/errors'
import type { AuthSession, FailureLimiter, PasswordHasher, PendingRegistrationRepository } from '../types'
import { type IssueSessionDeps, issueSession } from './issueSession'

const BAD_REQUEST_STATUS = 400
const CONFLICT_STATUS = 409
// Одно сообщение для неверного, истёкшего, уже использованного токена и неверного пароля: без подсказки, что именно не так
const INVALID_VERIFICATION_MESSAGE = 'The link is invalid or expired, or the password is wrong'
const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists, sign in instead'

export type VerifyEmailDeps = IssueSessionDeps & {
  pendingRegistrations: PendingRegistrationRepository
  hasher: PasswordHasher
  // Общий с входом лимит неудач по email
  failureLimiter: FailureLimiter
}

function invalidVerification(): AppError {
  return new AppError(BAD_REQUEST_STATUS, INVALID_VERIFICATION_MESSAGE)
}

// Пароль обязателен: ссылка из письма по чужой регистрации без пароля этой регистрации ничего не активирует.
// После подтверждения учитель сразу входит: ответ — сессия, как при входе
export function makeVerifyEmail(deps: VerifyEmailDeps) {
  return async function verifyEmail(input: VerifyEmailInput): Promise<AuthSession> {
    // Одно «сейчас» на всю операцию: проверка срока здесь и CAS по сроку в activate видят одно время
    const now = deps.now()
    const tokenHash = deps.tokens.hashOpaqueToken(input.token)
    const registration = await deps.pendingRegistrations.findByTokenHash(tokenHash)

    if (registration === null || registration.expiresAt <= now) {
      // Сверка с dummy-хэшем: ответ по времени не отличается от «неверного пароля»
      await deps.hasher.verify(null, input.password)
      throw invalidVerification()
    }

    // Перегрузка — до резерва: 503 не должен тратить лимит неудач учителя
    deps.hasher.assertCapacity()
    const reservation = deps.failureLimiter.reserve(registration.email)
    if (!reservation.allowed) throw new RateLimitedError(reservation.retryAfterSeconds)

    let isPasswordValid: boolean
    try {
      isPasswordValid = await deps.hasher.verify(registration.passwordHash, input.password)
    } catch (error) {
      // Очередь заполнилась между проверкой и сверкой — это не неудачная попытка
      reservation.release()
      throw error
    }
    // Резерв не снимается: неверный пароль — неудачная попытка
    if (!isPasswordValid) throw invalidVerification()
    reservation.release()

    const activation = await deps.pendingRegistrations.activate(registration, tokenHash, now)
    // Тот, кто знает токен из письма и пароль регистрации, владеет почтой: ему можно сказать, что аккаунт уже есть
    if (activation.status === 'emailTaken') throw new AppError(CONFLICT_STATUS, EMAIL_TAKEN_MESSAGE)
    if (activation.status === 'alreadyUsed') throw invalidVerification()

    return issueSession(deps, activation.teacher)
  }
}
