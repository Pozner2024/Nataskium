import type { AuthSessionResponse } from '@nataskium/shared/schemas'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared'
import { type SessionStore, createSessionSync } from '@/features/auth'

const TEACHER = {
  id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
  email: 'qa-anna@example.test',
  displayName: 'Анна',
  hasPassword: true,
  hasGoogle: false,
}

function session(accessToken: string): AuthSessionResponse {
  return { accessToken, teacher: TEACHER }
}

// Изменяемый фейк: в SessionStore поля readonly только для модуля синхронизации
type FakeStore = { accessToken: string | null; sessionVersion: number; status: string } & Pick<SessionStore, 'setSession' | 'clearSession'>

function makeStore(): FakeStore {
  return {
    accessToken: null,
    sessionVersion: 0,
    status: 'unknown',
    setSession(next) {
      this.accessToken = next.accessToken
      this.status = 'authenticated'
      this.sessionVersion++
    },
    clearSession() {
      this.accessToken = null
      this.status = 'anonymous'
      this.sessionVersion++
    },
  }
}

type Listener = (event: MessageEvent<unknown>) => void

// BroadcastChannel в памяти: сообщение одного канала получают остальные каналы с тем же именем (как вкладки)
function makeChannelHub() {
  const channels: { name: string; listeners: Listener[]; posted: unknown[] }[] = []
  function createChannel(name: string) {
    const channel = { name, listeners: [] as Listener[], posted: [] as unknown[] }
    channels.push(channel)
    return {
      postMessage(data: unknown) {
        channel.posted.push(data)
        for (const other of channels) {
          if (other !== channel && other.name === name) other.listeners.forEach((listener) => listener({ data } as MessageEvent<unknown>))
        }
      },
      addEventListener(_type: string, listener: Listener) {
        channel.listeners.push(listener)
      },
      close() {},
    } as unknown as Pick<BroadcastChannel, 'postMessage' | 'addEventListener' | 'close'>
  }
  // Сообщение «снаружи», например из другой вкладки или подделанное
  function deliver(data: unknown) {
    for (const channel of channels) channel.listeners.forEach((listener) => listener({ data } as MessageEvent<unknown>))
  }
  return { createChannel, channels, deliver }
}

// Web Locks в памяти: запросы с одним именем выполняются строго по очереди
function makeLocks() {
  const queues = new Map<string, Promise<unknown>>()
  return {
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      const previous = queues.get(name) ?? Promise.resolve()
      const run = previous.then(callback, callback)
      queues.set(name, run.catch(() => undefined))
      return run
    },
  } as unknown as Pick<LockManager, 'request'>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('sessionSync: один refresh', () => {
  it('параллельные refreshSession в одной вкладке — один запрос, общий результат', async () => {
    const store = makeStore()
    const pending = deferred<AuthSessionResponse>()
    let requests = 0
    const sync = createSessionSync(store, { refresh: () => (requests++, pending.promise) })

    const results = Promise.all([sync.refreshSession(), sync.refreshSession(), sync.refreshSession()])
    pending.resolve(session('qa-new'))

    expect(await results).toEqual([true, true, true])
    expect(requests).toBe(1)
    expect(store.accessToken).toBe('qa-new')
  })

  it('после завершения следующий refreshSession — новый запрос', async () => {
    const store = makeStore()
    let requests = 0
    const sync = createSessionSync(store, { refresh: async () => session(`qa-${++requests}`) })

    await sync.refreshSession()
    await sync.refreshSession()

    expect(requests).toBe(2)
  })

  // Две вкладки с одной cookie: вторая не отправляет тот же токен, а получает сессию первой
  it('две вкладки: refresh по очереди через Web Locks, вторая берёт сессию первой без своего запроса', async () => {
    const hub = makeChannelHub()
    const locks = makeLocks()
    let requests = 0
    const refresh = async () => session(`qa-${++requests}`)
    const firstStore = makeStore()
    const secondStore = makeStore()
    const first = createSessionSync(firstStore, { locks, createChannel: hub.createChannel, refresh })
    const second = createSessionSync(secondStore, { locks, createChannel: hub.createChannel, refresh })

    const results = await Promise.all([first.refreshSession(), second.refreshSession()])

    expect(results).toEqual([true, true])
    expect(requests).toBe(1)
    expect(secondStore.accessToken).toBe('qa-1')
  })

  it('без Web Locks — refresh всё равно выполняется', async () => {
    const store = makeStore()
    const sync = createSessionSync(store, { refresh: async () => session('qa-new') })

    expect(await sync.refreshSession()).toBe(true)
    expect(store.status).toBe('authenticated')
  })
})

describe('sessionSync: ошибки refresh', () => {
  it('401 — сессия сброшена, false, повторного запроса нет', async () => {
    const store = makeStore()
    store.setSession(session('qa-old'))
    let requests = 0
    const sync = createSessionSync(store, {
      refresh: async () => {
        requests++
        throw new ApiError(401)
      },
    })

    expect(await sync.refreshSession()).toBe(false)
    expect(requests).toBe(1)
    expect(store.status).toBe('anonymous')
    expect(store.accessToken).toBeNull()
  })

  it.each([
    ['503', new ApiError(503)],
    ['сеть', new ApiError(0)],
    ['не ApiError', new TypeError('boom')],
  ])('%s — ошибка пробрасывается, сессия не сбрасывается', async (_name, failure) => {
    const store = makeStore()
    store.setSession(session('qa-old'))
    const sync = createSessionSync(store, {
      refresh: async () => {
        throw failure
      },
    })

    await expect(sync.refreshSession()).rejects.toBe(failure)
    expect(store.accessToken).toBe('qa-old')
  })

  it('после ошибки можно повторить: общий промис сброшен', async () => {
    const store = makeStore()
    let attempt = 0
    const sync = createSessionSync(store, {
      refresh: async () => {
        attempt++
        if (attempt === 1) throw new ApiError(503)
        return session('qa-new')
      },
    })

    await expect(sync.refreshSession()).rejects.toBeInstanceOf(ApiError)
    expect(await sync.refreshSession()).toBe(true)
  })
})

describe('sessionSync: сообщения между вкладками', () => {
  it('успешный refresh рассылает сессию другим вкладкам', async () => {
    const hub = makeChannelHub()
    const otherStore = makeStore()
    createSessionSync(otherStore, { createChannel: hub.createChannel, refresh: async () => session('x') })
    const sync = createSessionSync(makeStore(), { createChannel: hub.createChannel, refresh: async () => session('qa-new') })

    await sync.refreshSession()

    expect(otherStore.accessToken).toBe('qa-new')
  })

  it('publishSession и publishLogout меняют свою вкладку и другие', () => {
    const hub = makeChannelHub()
    const ownStore = makeStore()
    const otherStore = makeStore()
    const sync = createSessionSync(ownStore, { createChannel: hub.createChannel })
    createSessionSync(otherStore, { createChannel: hub.createChannel })

    sync.publishSession(session('qa-login'))
    expect([ownStore.accessToken, otherStore.accessToken]).toEqual(['qa-login', 'qa-login'])

    sync.publishLogout()
    expect([ownStore.status, otherStore.status]).toEqual(['anonymous', 'anonymous'])
  })

  it('401 refresh не рассылает выход: другие вкладки сами узнают о нём при своём refresh', async () => {
    const hub = makeChannelHub()
    const otherStore = makeStore()
    otherStore.setSession(session('qa-other'))
    createSessionSync(otherStore, { createChannel: hub.createChannel })
    const sync = createSessionSync(makeStore(), {
      createChannel: hub.createChannel,
      refresh: async () => {
        throw new ApiError(401)
      },
    })

    await sync.refreshSession()

    expect(otherStore.accessToken).toBe('qa-other')
  })

  // Сообщения same-origin, но в store попадает только сессия, прошедшая схему
  it.each([
    ['не объект', 'session'],
    ['null', null],
    ['без type', { session: session('qa-x') }],
    ['неизвестный type', { type: 'grant', session: session('qa-x') }],
    ['session без поля session', { type: 'session' }],
    ['сессия без teacher', { type: 'session', session: { accessToken: 'qa-x' } }],
    ['пустой accessToken', { type: 'session', session: { accessToken: '', teacher: TEACHER } }],
    ['teacher с id не UUID', { type: 'session', session: { accessToken: 'qa-x', teacher: { ...TEACHER, id: 'evil' } } }],
  ])('неверное сообщение (%s) — store не меняется', (_name, data) => {
    const hub = makeChannelHub()
    const store = makeStore()
    store.setSession(session('qa-own'))
    createSessionSync(store, { createChannel: hub.createChannel })

    hub.deliver(data)

    expect(store.accessToken).toBe('qa-own')
    expect(store.sessionVersion).toBe(1)
  })

  it('лишние поля в сообщении о сессии отбрасываются схемой', () => {
    const hub = makeChannelHub()
    let saved: AuthSessionResponse | undefined
    const store = makeStore()
    store.setSession = (next) => {
      saved = next
    }
    createSessionSync(store, { createChannel: hub.createChannel })

    hub.deliver({ type: 'session', session: { ...session('qa-x'), refreshToken: 'qa-raw', teacher: { ...TEACHER, passwordHash: '$argon2id$x' } } })

    expect(saved).toEqual(session('qa-x'))
  })

  it('сообщение logout — выход в этой вкладке', () => {
    const hub = makeChannelHub()
    const store = makeStore()
    store.setSession(session('qa-own'))
    createSessionSync(store, { createChannel: hub.createChannel })

    hub.deliver({ type: 'logout' })

    expect(store.status).toBe('anonymous')
  })

  it('без BroadcastChannel всё работает внутри вкладки', async () => {
    const store = makeStore()
    const sync = createSessionSync(store, { refresh: async () => session('qa-new') })

    sync.publishSession(session('qa-login'))
    expect(store.accessToken).toBe('qa-login')
    expect(() => sync.close()).not.toThrow()
  })
})
