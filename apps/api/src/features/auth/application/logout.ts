import type { RefreshTokenRepository, TokenService } from '../types'

export type LogoutDeps = {
  refreshTokens: RefreshTokenRepository
  tokens: TokenService
}

// Выход на этом устройстве: удаляется семья текущего refresh. Неизвестный или пустой токен — тоже успех:
// выход идемпотентен, а ответ не подсказывает, был ли токен действующим
export function makeLogout(deps: LogoutDeps) {
  return async function logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken === undefined || rawRefreshToken === '') return

    const session = await deps.refreshTokens.findByHash(deps.tokens.hashOpaqueToken(rawRefreshToken))
    if (session === null) return

    await deps.refreshTokens.deleteFamily(session.familyId)
  }
}
