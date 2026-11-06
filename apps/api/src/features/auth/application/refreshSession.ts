import type { AuthSession, RefreshTokenRepository, TeacherRepository } from '../types'
import { sessionInvalid } from './authErrors'
import { type IssueSessionDeps, refreshTokenExpiry, toTeacherView } from './issueSession'

const MS_PER_MINUTE = 60 * 1000
// Не меньше срока access-токена (15 мин): иначе выданный access пережил бы саму сессию
const MIN_REMAINING_SESSION_MINUTES = 15
export const MIN_REMAINING_SESSION_MS = MIN_REMAINING_SESSION_MINUTES * MS_PER_MINUTE

export type RefreshSessionDeps = IssueSessionDeps & {
  teachers: TeacherRepository
}

async function revokeFamily(refreshTokens: RefreshTokenRepository, familyId: string): Promise<never> {
  await refreshTokens.deleteFamily(familyId)
  throw sessionInvalid()
}

// Ротация: старый refresh отзывается, выдаётся новый в той же семье. Повторное предъявление отозванного токена —
// признак кражи: семья удаляется целиком, и вор, и владелец входят заново
export function makeRefreshSession(deps: RefreshSessionDeps) {
  return async function refreshSession(rawRefreshToken: string): Promise<AuthSession> {
    const now = deps.now()
    const session = await deps.refreshTokens.findByHash(deps.tokens.hashOpaqueToken(rawRefreshToken))
    if (session === null) throw sessionInvalid()

    if (session.revokedAt !== null) {
      // Без email и токенов: teacherId — для расследования, по нему не узнать человека без доступа к базе
      console.warn('Refresh token reuse detected', { teacherId: session.teacherId })
      return revokeFamily(deps.refreshTokens, session.familyId)
    }
    if (session.expiresAt <= now) return revokeFamily(deps.refreshTokens, session.familyId)
    // До конца абсолютного срока осталось меньше, чем живёт access: новый токен на минуты не выдаём
    if (session.familyExpiresAt.getTime() - now.getTime() < MIN_REMAINING_SESSION_MS) {
      return revokeFamily(deps.refreshTokens, session.familyId)
    }

    const teacher = await deps.teachers.findById(session.teacherId)
    // Учителя удалили: его токены уже ушли каскадом, этот — гонка с удалением
    if (teacher === null) throw sessionInvalid()

    const refreshToken = deps.tokens.generateOpaqueToken()
    const refreshTokenExpiresAt = refreshTokenExpiry(now, session.familyExpiresAt)
    const rotated = await deps.refreshTokens.rotate(
      session.id,
      {
        teacherId: session.teacherId,
        familyId: session.familyId,
        familyExpiresAt: session.familyExpiresAt,
        tokenHash: deps.tokens.hashOpaqueToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
      },
      now,
    )
    // Токен успели ротировать параллельно: два предъявления одного токена — то же, что повторное использование
    if (!rotated) {
      console.warn('Refresh token reuse detected', { teacherId: session.teacherId })
      return revokeFamily(deps.refreshTokens, session.familyId)
    }

    return {
      accessToken: await deps.tokens.signAccessToken(teacher.id),
      refreshToken,
      refreshTokenExpiresAt,
      teacher: toTeacherView(teacher),
    }
  }
}
