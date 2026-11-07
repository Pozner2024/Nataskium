import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from './store'

const TEACHER = {
  id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
  email: 'qa-anna@example.test',
  displayName: 'Анна',
  hasPassword: true,
  hasGoogle: false,
}
const SESSION = { accessToken: 'qa-access-token', teacher: TEACHER }

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useAuthStore', () => {
  it('в начале статус unknown: сессия ещё не проверена через refresh', () => {
    const store = useAuthStore()

    expect(store.status).toBe('unknown')
    expect(store.accessToken).toBeNull()
    expect(store.teacher).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('setSession — authenticated, токен и учитель в памяти, версия растёт', () => {
    const store = useAuthStore()

    store.setSession(SESSION)

    expect(store.status).toBe('authenticated')
    expect(store.isAuthenticated).toBe(true)
    expect(store.accessToken).toBe('qa-access-token')
    expect(store.teacher).toEqual(TEACHER)
    expect(store.sessionVersion).toBe(1)
  })

  it('clearSession — anonymous, токена и учителя нет, версия растёт', () => {
    const store = useAuthStore()
    store.setSession(SESSION)

    store.clearSession()

    expect(store.status).toBe('anonymous')
    expect(store.isAuthenticated).toBe(false)
    expect(store.accessToken).toBeNull()
    expect(store.teacher).toBeNull()
    expect(store.sessionVersion).toBe(2)
  })

  it('каждая смена сессии меняет версию, даже с тем же токеном', () => {
    const store = useAuthStore()

    store.setSession(SESSION)
    store.setSession(SESSION)
    store.clearSession()
    store.clearSession()

    expect(store.sessionVersion).toBe(4)
  })

  // Access-токен — только в памяти: не в localStorage, sessionStorage и cookie
  it('состояние store — только токен, учитель, статус и версия: без refresh-токена и хранилищ браузера', () => {
    const store = useAuthStore()

    store.setSession({ ...SESSION, refreshToken: 'qa-raw-refresh' } as typeof SESSION)

    expect(Object.keys(store.$state).sort()).toEqual(['accessToken', 'sessionVersion', 'status', 'teacher'])
    expect(JSON.stringify(store.$state)).not.toContain('qa-raw-refresh')
  })

  it('разные Pinia — разные store: после перезагрузки сессии нет', () => {
    useAuthStore().setSession(SESSION)

    setActivePinia(createPinia())

    expect(useAuthStore().status).toBe('unknown')
  })
})
