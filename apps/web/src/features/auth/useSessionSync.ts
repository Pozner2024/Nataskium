import { type SessionSync, createSessionSync } from './sessionSync'
import { useAuthStore } from './store'

let sessionSync: SessionSync | null = null

// Один экземпляр на вкладку: общий промис refresh и один BroadcastChannel. Только в браузере —
// страницы /auth/** без SSR, а на сервере у разных запросов был бы общий экземпляр
export function useSessionSync(): SessionSync {
  if (typeof window === 'undefined') throw new Error('useSessionSync is browser-only')
  sessionSync ??= createSessionSync(useAuthStore())
  return sessionSync
}
