import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { ApiError } from '@/shared'
import { authApi, logout, useAuthStore } from '@/features/auth'

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

beforeEach(async () => {
  vi.restoreAllMocks()
  useAuthStore().$patch({ accessToken: null, teacher: null, status: 'unknown' })
  useAuthStore().setSession(SESSION)
  await nextTick()
})

describe('logout', () => {
  it('сервер подтвердил выход — true, сессия очищена', async () => {
    vi.spyOn(authApi, 'logout').mockResolvedValue()

    await expect(logout()).resolves.toBe(true)

    expect(useAuthStore().status).toBe('anonymous')
    expect(useAuthStore().accessToken).toBeNull()
  })

  it('сервер не подтвердил выход — false, сессия остаётся видимой', async () => {
    vi.spyOn(authApi, 'logout').mockRejectedValue(new ApiError(500))

    await expect(logout()).resolves.toBe(false)

    expect(useAuthStore().status).toBe('authenticated')
    expect(useAuthStore().accessToken).toBe(SESSION.accessToken)
  })

  it('сеть недоступна — false, сессия остаётся', async () => {
    vi.spyOn(authApi, 'logout').mockRejectedValue(new ApiError(0))

    await expect(logout()).resolves.toBe(false)

    expect(useAuthStore().isAuthenticated).toBe(true)
  })
})
