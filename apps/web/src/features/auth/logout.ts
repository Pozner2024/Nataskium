import { authApi } from './authApi'
import { useSessionSync } from './useSessionSync'

// true — сервер подтвердил выход, сессия очищена и в других вкладках. false — не подтвердил: сессия остаётся
// видимой, чтобы учитель не ушёл с общего компьютера, считая, что вышел
export async function logout(): Promise<boolean> {
  try {
    await authApi.logout()
  } catch {
    return false
  }
  useSessionSync().publishLogout()
  return true
}
