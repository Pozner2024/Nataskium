import { ApiError } from '@/shared'
import { useAuthStore } from './store'
import { useSessionSync } from './useSessionSync'

const UNAUTHORIZED_STATUS = 401

// Запрос от имени вошедшего учителя. Access-токен живёт 15 минут: на 401 — один refresh и один повтор.
// Сессии нет (refresh отказал) — store очищен, наружу уходит ApiError 401. Только в браузере
export async function authorizedRequest<T>(request: (accessToken: string) => Promise<T>): Promise<T> {
  const store = useAuthStore()
  const sessionSync = useSessionSync()

  // Токена в памяти нет — одна попытка восстановить сессию. Не вышло — сессии нет: повторный refresh ниже
  // ничего бы не дал и только тратил лимит /auth/refresh
  if (store.accessToken === null) await sessionSync.refreshSession()
  if (store.accessToken === null) throw new ApiError(UNAUTHORIZED_STATUS)

  try {
    return await request(store.accessToken)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== UNAUTHORIZED_STATUS) throw error
  }

  const isRefreshed = await sessionSync.refreshSession()
  if (!isRefreshed || store.accessToken === null) throw new ApiError(UNAUTHORIZED_STATUS)
  return request(store.accessToken)
}
