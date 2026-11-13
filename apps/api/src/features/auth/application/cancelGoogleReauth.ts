import type { PendingGoogleReauthRepository, TokenService } from '../types'

export type CancelGoogleReauthDeps = {
  pendingGoogleReauths: PendingGoogleReauthRepository
  tokens: Pick<TokenService, 'hashOpaqueToken'>
}

// Учитель отменил вход в Google или проверка не прошла: подтверждение гасится, аккаунт остаётся
export function makeCancelGoogleReauth(deps: CancelGoogleReauthDeps) {
  return async function cancelGoogleReauth(state: string): Promise<void> {
    await deps.pendingGoogleReauths.deleteByStateHash(deps.tokens.hashOpaqueToken(state))
  }
}
