import type { RefreshTokenRepository } from '../types'

export type LogoutAllDeps = {
  refreshTokens: RefreshTokenRepository
}

// «Выйти на всех устройствах»: учитель берётся из access-токена (requireAuth). Уже выданные access-токены
// живут до своего срока (15 мин) — отзыва access в первой версии нет
export function makeLogoutAll(deps: LogoutAllDeps) {
  return async function logoutAll(teacherId: string): Promise<void> {
    await deps.refreshTokens.deleteAllForTeacher(teacherId)
  }
}
