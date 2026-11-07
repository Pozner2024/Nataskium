import { type AuthSessionResponse, authSessionResponseSchema } from '@nataskium/shared/schemas'
import { ApiError } from '@/shared'
import { authApi } from './authApi'

const CHANNEL_NAME = 'nataskium-auth'
const REFRESH_LOCK_NAME = 'nataskium-refresh'
const UNAUTHORIZED_STATUS = 401

type SyncMessage = { type: 'session'; session: AuthSessionResponse } | { type: 'logout' }

// Часть store, нужная синхронизации: так модуль проверяется с фейковым store
export type SessionStore = {
  readonly accessToken: string | null
  readonly sessionVersion: number
  setSession(session: AuthSessionResponse): void
  clearSession(): void
}

// Браузерные API подменяются в тестах; без Web Locks (Safari < 15.4) — один refresh за раз только внутри вкладки
export type SessionSyncEnvironment = {
  locks?: Pick<LockManager, 'request'>
  createChannel?: (name: string) => Pick<BroadcastChannel, 'postMessage' | 'addEventListener' | 'close'>
  refresh?: () => Promise<AuthSessionResponse>
}

function parseMessage(data: unknown): SyncMessage | null {
  if (typeof data !== 'object' || data === null || !('type' in data)) return null
  if (data.type === 'logout') return { type: 'logout' }
  if (data.type !== 'session' || !('session' in data)) return null
  // Сообщения same-origin, но формат всё равно проверяем: в store попадает только корректная сессия
  const session = authSessionResponseSchema.safeParse(data.session)
  return session.success ? { type: 'session', session: session.data } : null
}

function defaultEnvironment(): SessionSyncEnvironment {
  return {
    locks: typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined,
    createChannel: typeof BroadcastChannel === 'undefined' ? undefined : (name) => new BroadcastChannel(name),
    refresh: authApi.refresh,
  }
}

// Refresh-токен ротируется при каждом refresh: две вкладки, отправившие один и тот же токен одновременно,
// сработали бы как повторное использование, и сервер удалил бы сессию. Поэтому refresh — по одному:
// между вкладками через Web Locks, внутри вкладки — через общий промис. Безопасность держит блокировка:
// следующая вкладка отправляет уже новую cookie, которую браузер сохранил из ответа предыдущей.
// Рассылка сессии — только экономия запроса: если сообщение пришло раньше блокировки, refresh не нужен
export function createSessionSync(store: SessionStore, environment: SessionSyncEnvironment = defaultEnvironment()) {
  const refresh = environment.refresh ?? authApi.refresh
  const channel = environment.createChannel?.(CHANNEL_NAME) ?? null
  let inFlight: Promise<boolean> | null = null

  channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = parseMessage(event.data)
    if (message?.type === 'session') store.setSession(message.session)
    if (message?.type === 'logout') store.clearSession()
  })

  async function refreshOnce(versionBefore: number): Promise<boolean> {
    // Пока ждали блокировку, другая вкладка уже обновила сессию и прислала её
    if (store.sessionVersion !== versionBefore && store.accessToken !== null) return true

    try {
      const session = await refresh()
      store.setSession(session)
      channel?.postMessage({ type: 'session', session } satisfies SyncMessage)
      return true
    } catch (error) {
      // Повторять со старым токеном нельзя (решение пользователя): 401 — сессии нет, нужен вход
      if (error instanceof ApiError && error.status === UNAUTHORIZED_STATUS) {
        store.clearSession()
        return false
      }
      throw error
    }
  }

  // true — сессия есть (обновлена здесь или в другой вкладке), false — нужен вход
  function refreshSession(): Promise<boolean> {
    if (inFlight !== null) return inFlight

    const versionBefore = store.sessionVersion
    const run = environment.locks
      ? environment.locks.request(REFRESH_LOCK_NAME, () => refreshOnce(versionBefore))
      : refreshOnce(versionBefore)
    inFlight = run.finally(() => {
      inFlight = null
    })
    return inFlight
  }

  // После входа, подтверждения email и привязки Google: другие вкладки получают ту же сессию
  function publishSession(session: AuthSessionResponse): void {
    store.setSession(session)
    channel?.postMessage({ type: 'session', session } satisfies SyncMessage)
  }

  function publishLogout(): void {
    store.clearSession()
    channel?.postMessage({ type: 'logout' } satisfies SyncMessage)
  }

  return { refreshSession, publishSession, publishLogout, close: () => channel?.close() }
}

export type SessionSync = ReturnType<typeof createSessionSync>
