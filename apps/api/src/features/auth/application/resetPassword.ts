import type { ResetPasswordInput } from '@nataskium/shared/schemas'
import { AppError } from '../../../shared/errors'
import type { Clock, EmailSender, PasswordHasher, PasswordResetRepository, TokenService } from '../types'
import { sendInBackground } from './sendInBackground'

const BAD_REQUEST_STATUS = 400
// Одно сообщение для неизвестной, истёкшей и уже использованной ссылки
const INVALID_RESET_MESSAGE = 'The reset link is invalid or expired, request a new one'

export type ResetPasswordDeps = {
  passwordResets: PasswordResetRepository
  hasher: PasswordHasher
  tokens: TokenService
  emailSender: EmailSender
  now: Clock
}

function invalidReset(): AppError {
  return new AppError(BAD_REQUEST_STATUS, INVALID_RESET_MESSAGE)
}

// После сброса учитель выходит на всех устройствах и входит заново с новым паролем: сессия здесь не выдаётся
export function makeResetPassword(deps: ResetPasswordDeps) {
  return async function resetPassword(input: ResetPasswordInput): Promise<void> {
    // Одно «сейчас»: проверка срока здесь и CAS по сроку в completeReset видят одно время
    const now = deps.now()
    const tokenHash = deps.tokens.hashOpaqueToken(input.token)
    const reset = await deps.passwordResets.findByTokenHash(tokenHash)
    if (reset === null || reset.expiresAt <= now) throw invalidReset()

    // Пароль уже прошёл passwordSchema (NFC, минимум, блок-лист): хэшируется результат разбора
    const passwordHash = await deps.hasher.hash(input.password)
    const result = await deps.passwordResets.completeReset(reset, tokenHash, passwordHash, now)
    if (result.status === 'invalid') throw invalidReset()

    // Одно письмо на сброс: completeReset вернул 'reset' ровно одному запросу (CAS по ссылке).
    // Отдельный лимит не нужен — ссылку выдаёт сам владелец почты, и она одноразовая
    const { email, displayName } = result.teacher
    sendInBackground('passwordReset.changed', () => deps.emailSender.sendPasswordChangedEmail(email, displayName))
  }
}
