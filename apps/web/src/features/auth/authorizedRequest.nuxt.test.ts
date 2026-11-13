import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { ApiError } from '@/shared'
import { authApi, authorizedRequest, useAuthStore } from '@/features/auth'

const SESSION = {
  accessToken: 'access-2',
  teacher: {
    id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
    email: 'qa-anna@example.test',
    displayName: 'Анна',
    hasPassword: true,
    hasGoogle: false,
  },
}

// Шпион ставится до первого useSessionSync: экземпляр на вкладку запоминает функцию refresh
const refresh = vi.spyOn(authApi, 'refresh')

function signIn(accessToken: string) {
  useAuthStore().setSession({ ...SESSION, accessToken })
}

beforeEach(async () => {
  refresh.mockReset()
  useAuthStore().$patch({ accessToken: null, teacher: null, status: 'unknown' })
  await nextTick()
})

describe('authorizedRequest: обычный запрос', () => {
  it('с токеном в store передаёт его в запрос, refresh не нужен', async () => {
    signIn('access-1')
    const request = vi.fn().mockResolvedValue('ok')

    await expect(authorizedRequest(request)).resolves.toBe('ok')

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('access-1')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('без токена сначала получает сессию через refresh', async () => {
    refresh.mockResolvedValue(SESSION)
    const request = vi.fn().mockResolvedValue('ok')

    await expect(authorizedRequest(request)).resolves.toBe('ok')

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('access-2')
  })

  it('без токена и refresh отказал — ApiError 401, запрос не уходит', async () => {
    refresh.mockRejectedValue(new ApiError(401))
    const request = vi.fn()

    await expect(authorizedRequest(request)).rejects.toMatchObject({ status: 401 })

    expect(request).not.toHaveBeenCalled()
  })
})

describe('authorizedRequest: 401 от API', () => {
  it('401 → один refresh → один повтор с новым токеном', async () => {
    signIn('access-1')
    refresh.mockResolvedValue(SESSION)
    const request = vi.fn()
      .mockRejectedValueOnce(new ApiError(401))
      .mockResolvedValueOnce('ok')

    await expect(authorizedRequest(request)).resolves.toBe('ok')

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(request.mock.calls).toEqual([['access-1'], ['access-2']])
  })

  it('refresh отказал — ApiError 401, повтора нет, сессия сброшена', async () => {
    signIn('access-1')
    refresh.mockRejectedValue(new ApiError(401))
    const request = vi.fn().mockRejectedValue(new ApiError(401))

    await expect(authorizedRequest(request)).rejects.toMatchObject({ status: 401 })

    expect(request).toHaveBeenCalledTimes(1)
    expect(useAuthStore().status).toBe('anonymous')
  })

  it('повторный запрос снова 401 — ошибка наружу, второго refresh и третьего запроса нет', async () => {
    signIn('access-1')
    refresh.mockResolvedValue(SESSION)
    const request = vi.fn().mockRejectedValue(new ApiError(401))

    await expect(authorizedRequest(request)).rejects.toMatchObject({ status: 401 })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['400 с issues', new ApiError(400, [{ path: ['newPassword'], message: 'Password must be at least 4 characters' }])],
    ['403', new ApiError(403)],
    ['429', new ApiError(429, [], 60)],
    ['500', new ApiError(500)],
  ])('%s — пробрасывается как есть, refresh не вызывается', async (_name, error) => {
    signIn('access-1')
    const request = vi.fn().mockRejectedValue(error)

    await expect(authorizedRequest(request)).rejects.toBe(error)

    expect(refresh).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('не ApiError (сеть, код) — пробрасывается как есть, refresh не вызывается', async () => {
    signIn('access-1')
    const failure = new TypeError('fetch failed')
    const request = vi.fn().mockRejectedValue(failure)

    await expect(authorizedRequest(request)).rejects.toBe(failure)

    expect(refresh).not.toHaveBeenCalled()
  })
})
