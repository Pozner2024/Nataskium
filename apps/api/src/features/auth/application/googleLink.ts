import { timingSafeEqual } from 'node:crypto'
import type { GoogleLinkInput } from '@nataskium/shared/schemas'
import { AppError, RateLimitedError } from '../../../shared/errors'
import type { AuthSession, EmailSender, FailureLimiter, PasswordHasher, PendingGoogleLinkRepository } from '../types'
import { type IssueSessionDeps, issueSession } from './issueSession'
import { sendInBackground } from './sendInBackground'

const BAD_REQUEST_STATUS = 400
const CONFLICT_STATUS = 409
// Тот же текст, что при входе по паролю. Один на неверный, истёкший, использованный токен и неверный пароль
const INVALID_LINK_MESSAGE = 'Wrong email or password'
const LINK_CONFLICT_MESSAGE = 'This Google account cannot be linked to this account'

export type GoogleLinkDeps = IssueSessionDeps & {
  pendingGoogleLinks: PendingGoogleLinkRepository
  hasher: PasswordHasher
  // Общий с входом и подтверждением email лимит неудач по email
  failureLimiter: FailureLimiter
  emailSender: EmailSender
}

function invalidLink(): AppError {
  return new AppError(BAD_REQUEST_STATUS, INVALID_LINK_MESSAGE)
}

// Хэши одной длины (hex SHA-256); сравнение за постоянное время
function hashesMatch(actual: string, expected: string): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// linkSecret — из cookie __Secure-google_link; undefined — cookie нет

// Привязка Google к учителю с паролем: токен из редиректа callback + пароль учителя. Пароль доказывает, что
// аккаунт Google с тем же email действительно принадлежит учителю
export function makeGoogleLink(deps: GoogleLinkDeps) {
  return async function googleLink(input: GoogleLinkInput, linkSecret: string | undefined): Promise<AuthSession> {
    // Одно «сейчас»: проверка срока здесь и CAS по сроку в completeLink видят одно время
    const now = deps.now()
    const tokenHash = deps.tokens.hashOpaqueToken(input.token)
    const link = await deps.pendingGoogleLinks.findByTokenHash(tokenHash)

    // Чужой браузер (нет cookie или она от другого входа) — как неизвестный токен: учитель, которому прислали
    // ссылку атакующего, не привяжет чужой Google своим паролем. Неудача по email не засчитывается: иначе
    // атакующий такими ссылками блокировал бы учителю вход
    const isThisBrowser =
      link !== null && linkSecret !== undefined && hashesMatch(deps.tokens.hashOpaqueToken(linkSecret), link.linkSecretHash)

    if (link === null || link.expiresAt <= now || !isThisBrowser) {
      // Сверка с dummy-хэшем: ответ по времени не отличается от «неверного пароля»
      await deps.hasher.verify(null, input.password)
      throw invalidLink()
    }

    // Перегрузка — до резерва: 503 не должен тратить лимит неудач учителя
    deps.hasher.assertCapacity()
    const reservation = deps.failureLimiter.reserve(link.teacherEmail)
    if (!reservation.allowed) throw new RateLimitedError(reservation.retryAfterSeconds)

    let isPasswordValid: boolean
    try {
      isPasswordValid = await deps.hasher.verify(link.teacherPasswordHash, input.password)
    } catch (error) {
      // Очередь заполнилась между проверкой и сверкой — это не неудачная попытка
      reservation.release()
      throw error
    }
    // Резерв не снимается: неверный пароль — неудачная попытка
    if (!isPasswordValid) throw invalidLink()
    reservation.release()

    const result = await deps.pendingGoogleLinks.completeLink(link, tokenHash, now)
    if (result.status === 'invalid') throw invalidLink()
    if (result.status === 'conflict') throw new AppError(CONFLICT_STATUS, LINK_CONFLICT_MESSAGE)

    // Пароль введён, но если это был не владелец (пароль утёк), владелец узнает и сбросит пароль
    const { email, displayName } = result.teacher
    sendInBackground('google.linked', () => deps.emailSender.sendGoogleLinkedEmail(email, displayName))
    return issueSession(deps, result.teacher)
  }
}
