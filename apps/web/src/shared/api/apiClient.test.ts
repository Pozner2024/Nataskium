import { authSessionResponseSchema } from '@nataskium/shared/schemas'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NETWORK_ERROR_STATUS, apiRequest, apiRequestWithoutBody } from './apiClient'

const SESSION = {
  accessToken: 'qa-access-token',
  teacher: {
    id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
    email: 'qa-anna@example.test',
    displayName: 'Анна',
    hasPassword: true,
    hasGoogle: false,
  },
}

type FetchCall = { url: string; init: RequestInit }

let calls: FetchCall[]
let respond: () => Promise<Response>

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status, headers }))
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  }
  catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

beforeEach(() => {
  calls = []
  respond = json(SESSION)
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return respond()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiRequest: запрос', () => {
  it('POST на /api/…, тело JSON, cookie отправляются', async () => {
    await apiRequest('/auth/login', authSessionResponseSchema, { body: { email: 'a@b.co', password: 'x' } })

    expect(calls).toHaveLength(1)
    const [{ url, init }] = calls as [FetchCall]
    expect(url).toBe('/api/auth/login')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"email":"a@b.co","password":"x"}')
  })

  it('без тела — без Content-Type и без body', async () => {
    await apiRequest('/auth/refresh', authSessionResponseSchema)

    expect(calls[0]?.init.headers).toEqual({})
    expect(calls[0]?.init.body).toBeUndefined()
  })

  it('accessToken — заголовок Authorization: Bearer', async () => {
    await apiRequest('/auth/me', authSessionResponseSchema, { method: 'GET', accessToken: 'qa-token' })

    expect(calls[0]?.init.method).toBe('GET')
    expect(calls[0]?.init.headers).toEqual({ Authorization: 'Bearer qa-token' })
  })

  it.each([null, ''])('пустой accessToken (%j) — без Authorization', async (accessToken) => {
    await apiRequest('/auth/me', authSessionResponseSchema, { accessToken })

    expect(calls[0]?.init.headers).toEqual({})
  })
})

describe('apiRequest: ответ разбирается схемой', () => {
  it('корректный ответ — данные схемы', async () => {
    expect(await apiRequest('/auth/login', authSessionResponseSchema)).toEqual(SESSION)
  })

  it('лишние поля ответа отбрасываются схемой', async () => {
    respond = json({ ...SESSION, refreshToken: 'qa-raw', teacher: { ...SESSION.teacher, passwordHash: '$argon2id$x' } })

    expect(await apiRequest('/auth/login', authSessionResponseSchema)).toEqual(SESSION)
  })

  it.each([
    ['другая форма', json({ message: 'ok' })],
    ['не JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ['пустое тело', () => Promise.resolve(new Response('', { status: 200 }))],
  ])('ответ 200 не по схеме (%s) — ApiError со статусом 0', async (_name, response) => {
    respond = response

    const error = await rejectionOf(apiRequest('/auth/login', authSessionResponseSchema))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: NETWORK_ERROR_STATUS, issues: [], retryAfterSeconds: null })
  })

  it('сбой сети — ApiError со статусом 0', async () => {
    respond = () => Promise.reject(new TypeError('Failed to fetch'))

    expect(await rejectionOf(apiRequest('/auth/login', authSessionResponseSchema))).toMatchObject({ status: NETWORK_ERROR_STATUS })
  })
})

describe('apiRequest: ошибки API', () => {
  it('400 с issues — статус и issues', async () => {
    const issues = [{ path: ['email'], message: 'Invalid email' }]
    respond = json({ error: 'Validation failed', issues }, 400)

    expect(await rejectionOf(apiRequest('/auth/register', authSessionResponseSchema))).toMatchObject({ status: 400, issues })
  })

  it.each([401, 403, 409, 500, 503])('%i — ApiError с этим статусом, без issues', async (status) => {
    respond = json({ error: 'x' }, status)

    expect(await rejectionOf(apiRequest('/auth/login', authSessionResponseSchema))).toMatchObject({ status, issues: [] })
  })

  it('тело ошибки не по схеме — статус сохраняется, issues пусты', async () => {
    respond = () => Promise.resolve(new Response('Bad Gateway', { status: 502 }))

    expect(await rejectionOf(apiRequest('/auth/login', authSessionResponseSchema))).toMatchObject({ status: 502, issues: [] })
  })

  it.each([
    ['число секунд', '120', 120],
    ['нет заголовка', undefined, null],
    ['мусор', 'soon', null],
    ['ноль', '0', null],
    ['отрицательное', '-5', null],
  ])('429 Retry-After: %s → %j', async (_name, header, expected) => {
    respond = json({ error: 'Too many attempts' }, 429, header === undefined ? {} : { 'Retry-After': header })

    expect(await rejectionOf(apiRequest('/auth/login', authSessionResponseSchema))).toMatchObject({ status: 429, retryAfterSeconds: expected })
  })

  it('текст ошибки API в ApiError не попадает', async () => {
    respond = json({ error: 'Wrong email or password' }, 401)

    const error = await rejectionOf(apiRequest('/auth/login', authSessionResponseSchema))

    expect((error as Error).message).not.toContain('Wrong email')
  })
})

describe('apiRequestWithoutBody', () => {
  it('204 — успех без разбора тела', async () => {
    respond = () => Promise.resolve(new Response(null, { status: 204 }))

    await expect(apiRequestWithoutBody('/auth/logout')).resolves.toBeUndefined()
  })

  it('200 с телом — успех, тело не разбирается', async () => {
    respond = json({ anything: true })

    await expect(apiRequestWithoutBody('/auth/logout')).resolves.toBeUndefined()
  })

  it('ошибка — ApiError со статусом', async () => {
    respond = json({ error: 'Forbidden' }, 403)

    expect(await rejectionOf(apiRequestWithoutBody('/auth/logout'))).toMatchObject({ status: 403 })
  })
})
