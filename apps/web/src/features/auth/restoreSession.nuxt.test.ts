import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { ApiError } from '@/shared'
import { authApi, restoreSession, useAuthStore, useSessionSync } from '@/features/auth'

const SIGNED_IN_HINT_KEY = 'nataskium-signed-in'
const SESSION = {
  accessToken: 'access-1',
  teacher: {
    id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
    email: 'qa-anna@example.test',
    displayName: 'Анна',
    hasPassword: true,
    hasGoogle: false,
  },
}

// Шпион ставится до первого useSessionSync и не снимается: экземпляр на вкладку запоминает функцию refresh
const refresh = vi.spyOn(authApi, 'refresh')

beforeEach(async () => {
  refresh.mockReset()
  useAuthStore().$patch({ accessToken: null, teacher: null, status: 'unknown' })
  await nextTick()
  localStorage.clear()
})

describe('restoreSession', () => {
  it('без признака входа не шлёт refresh и считает посетителя гостем', async () => {
    await restoreSession()

    expect(refresh).not.toHaveBeenCalled()
    expect(useAuthStore().status).toBe('anonymous')
  })

  it('с признаком входа возвращает сессию через refresh', async () => {
    localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
    refresh.mockResolvedValue(SESSION)

    await restoreSession()

    expect(useAuthStore().accessToken).toBe(SESSION.accessToken)
    expect(useAuthStore().status).toBe('authenticated')
  })

  it('401 от refresh: гость, признак входа убран', async () => {
    localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
    refresh.mockRejectedValue(new ApiError(401))

    await restoreSession()
    await nextTick()

    expect(useAuthStore().status).toBe('anonymous')
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBeNull()
  })

  it('сбой сети не роняет страницу: сессия неизвестна, признак входа остаётся', async () => {
    localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
    refresh.mockRejectedValue(new ApiError(0))

    await expect(restoreSession()).resolves.toBeUndefined()

    expect(useAuthStore().status).toBe('unknown')
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBe('1')
  })

  it('уже известную сессию не трогает', async () => {
    localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
    useAuthStore().setSession(SESSION)

    await restoreSession()

    expect(refresh).not.toHaveBeenCalled()
  })

  it('вход сохраняет признак, выход убирает; токена в хранилище нет', async () => {
    const sessionSync = useSessionSync()

    sessionSync.publishSession(SESSION)
    await nextTick()
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBe('1')
    expect(JSON.stringify({ ...localStorage })).not.toContain(SESSION.accessToken)

    sessionSync.publishLogout()
    await nextTick()
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBeNull()
  })
})
