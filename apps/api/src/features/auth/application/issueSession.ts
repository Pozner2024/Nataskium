import type { AuthSession, Clock, RefreshTokenRepository, TeacherAccount, TeacherView, TokenService } from '../types'
import { sessionInvalid } from './authErrors'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const REFRESH_TOKEN_TTL_DAYS = 14
const SESSION_ABSOLUTE_TTL_DAYS = 30
// Решение пользователя: refresh скользящий на 14 дней, но сессия живёт не дольше 30 дней с входа
export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * MS_PER_DAY
export const SESSION_ABSOLUTE_TTL_MS = SESSION_ABSOLUTE_TTL_DAYS * MS_PER_DAY
export const MAX_ACTIVE_SESSIONS = 5

export type IssueSessionDeps = {
  refreshTokens: RefreshTokenRepository
  tokens: TokenService
  now: Clock
}

// Скользящий срок refresh, но не дальше абсолютного срока сессии (CHECK refresh_tokens_expires_within_family_check)
export function refreshTokenExpiry(now: Date, familyExpiresAt: Date): Date {
  return new Date(Math.min(now.getTime() + REFRESH_TOKEN_TTL_MS, familyExpiresAt.getTime()))
}

export function toTeacherView(teacher: TeacherAccount): TeacherView {
  return {
    id: teacher.id,
    email: teacher.email,
    displayName: teacher.displayName,
    hasPassword: teacher.passwordHash !== null,
    hasGoogle: teacher.googleId !== null,
  }
}

// Вход, подтверждение email и позже вход через Google: новая семья refresh-токенов и access-токен
export async function issueSession(deps: IssueSessionDeps, teacher: TeacherAccount): Promise<AuthSession> {
  const now = deps.now()
  const familyExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS)
  const refreshTokenExpiresAt = refreshTokenExpiry(now, familyExpiresAt)
  const refreshToken = deps.tokens.generateOpaqueToken()

  const created = await deps.refreshTokens.createFamily(
    {
      teacherId: teacher.id,
      familyId: crypto.randomUUID(),
      familyExpiresAt,
      tokenHash: deps.tokens.hashOpaqueToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
    },
    MAX_ACTIVE_SESSIONS,
  )
  // Учителя удалили, пока шла проверка пароля или ссылки: сессии для него нет
  if (!created) throw sessionInvalid()

  return {
    accessToken: await deps.tokens.signAccessToken(teacher.id),
    refreshToken,
    refreshTokenExpiresAt,
    teacher: toTeacherView(teacher),
  }
}
