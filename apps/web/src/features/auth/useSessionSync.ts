import { watch } from 'vue'
import { type SessionSync, createSessionSync } from './sessionSync'
import { useAuthStore } from './store'

// Только признак «в этом браузере входили», не токен: без него гость не шлёт refresh при каждой загрузке
// страницы, и класс учеников с одного IP школы не исчерпывает лимит /api/auth/refresh
const SIGNED_IN_HINT_KEY = 'nataskium-signed-in'

let sessionSync: SessionSync | null = null

function hasSignedInHint(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_HINT_KEY) !== null
  } catch {
    // Хранилище закрыто (приватный режим, запрет в настройках): пробуем refresh
    return true
  }
}

function saveSignedInHint(isSignedIn: boolean): void {
  try {
    if (isSignedIn) localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
    else localStorage.removeItem(SIGNED_IN_HINT_KEY)
  } catch {
    // Без хранилища признак не сохраняется, восстановление сессии всё равно работает
  }
}

// Один экземпляр на вкладку: общий промис refresh и один BroadcastChannel. Только в браузере —
// страницы /auth/** без SSR, а на сервере у разных запросов был бы общий экземпляр
export function useSessionSync(): SessionSync {
  if (typeof window === 'undefined') throw new Error('useSessionSync is browser-only')
  if (sessionSync !== null) return sessionSync

  const store = useAuthStore()
  sessionSync = createSessionSync(store)
  watch(() => store.status, (status) => {
    if (status !== 'unknown') saveSignedInHint(status === 'authenticated')
  })
  return sessionSync
}

// После перезагрузки страницы access-токена в памяти нет: сессия возвращается через refresh (httpOnly cookie)
export async function restoreSession(): Promise<void> {
  const store = useAuthStore()
  if (store.status !== 'unknown') return
  if (!hasSignedInHint()) {
    store.clearSession()
    return
  }

  try {
    await useSessionSync().refreshSession()
  } catch {
    // Сеть или сервер недоступны: сессия остаётся неизвестной, следующая загрузка страницы попробует снова
  }
}
