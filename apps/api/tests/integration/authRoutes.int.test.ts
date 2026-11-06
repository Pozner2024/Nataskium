import { inspect } from 'node:util'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthLimits } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { flushBackground } from '../fakes/authFakes'
import { makeRecordingEmailSender } from '../fakes/recordingEmailSender'
import { TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTestPrisma, truncateAll } from './testDatabase'

// Сквозь HTTP: createApp с настоящими репозиториями на db-test, почта — фейк, из него берётся токен подтверждения
const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const WRONG_PASSWORD = 'qa-wrong-password'
const EVIL_ORIGIN = 'https://evil.example'
const TRUSTED_PROXY = '10.0.0.1'
const REFRESH_COOKIE = '__Secure-refresh_token'
const REFRESH_TTL_SECONDS = 14 * 24 * 60 * 60
const MAX_AGE_TOLERANCE_SECONDS = 5
const LOGIN_PER_IP_EMAIL = 10
const LOGIN_FAILURES_PER_EMAIL = 10
// Ниже лимита неудач по email: 429 в тестах X-Real-IP может прийти только от лимита по IP + email
const STRICT_IP_EMAIL_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 }
const SESSION_INVALID = { error: 'Session is invalid or expired, sign in again' }
const RATE_LIMITED = { error: 'Too many attempts, try again later' }

let prisma: PrismaClient

type TestApp = ReturnType<typeof createTestApp>

function makeClient(options: { limits?: Partial<AuthLimits>; trustedProxies?: string } = {}) {
  const email = makeRecordingEmailSender()
  const app: TestApp = createTestApp({
    prisma,
    emailSender: email.sender,
    limits: options.limits,
    env: options.trustedProxies === undefined ? undefined : { TRUSTED_PROXY_IPS: options.trustedProxies },
  })

  function post(path: string, body: unknown, options: { ip?: string; headers?: Record<string, string> } = {}) {
    return app.request(
      `/api/auth${path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN, ...options.headers },
        body: JSON.stringify(body),
      },
      fromIp(options.ip),
    )
  }

  function withCookie(path: string, cookie: string | undefined, headers: Record<string, string> = { origin: TEST_WEB_ORIGIN }) {
    return app.request(`/api/auth${path}`, { method: 'POST', headers: { ...headers, ...(cookie ? { cookie } : {}) } }, fromIp())
  }

  function withBearer(method: string, path: string, accessToken: string) {
    return app.request(`/api/auth${path}`, { method, headers: { authorization: `Bearer ${accessToken}` } }, fromIp())
  }

  async function signUp(address = EMAIL) {
    expect((await post('/register', { email: address, password: PASSWORD, displayName: 'Анна' })).status).toBe(202)
    await flushBackground()
    const verification = email.sent.filter((sent) => sent.kind === 'verification').at(-1)
    if (verification?.kind !== 'verification') throw new Error('no verification email')
    return post('/verify-email', { token: verification.rawToken, password: PASSWORD })
  }

  return { app, email, post, withCookie, withBearer, signUp }
}

// Пара name=value из Set-Cookie: так браузер отправит её обратно
function cookieOf(response: Response): string {
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

function attributesOf(response: Response): string[] {
  return (response.headers.get('set-cookie') ?? '').split(';').map((part) => part.trim())
}

function maxAgeOf(response: Response): number {
  const attribute = attributesOf(response).find((part) => part.startsWith('Max-Age='))
  return Number(attribute?.slice('Max-Age='.length))
}

function expectClearedCookie(response: Response) {
  const attributes = attributesOf(response)
  expect(attributes[0]).toBe(`${REFRESH_COOKIE}=`)
  expect(attributes).toContain('Max-Age=0')
  expect(attributes).toContain('Path=/api/auth')
  expect(attributes).toContain('Secure')
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('POST /api/auth/register', () => {
  it('202 и одно сообщение, письмо с токеном', async () => {
    const client = makeClient()

    const response = await client.post('/register', { email: ' Qa-Anna@Example.TEST ', password: PASSWORD })
    await flushBackground()

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ message: 'Check your email to finish registration' })
    expect(client.email.sent).toEqual([{ kind: 'verification', to: EMAIL, rawToken: expect.any(String) }])
  })

  it('для занятого email ответ тот же', async () => {
    const client = makeClient()
    await client.signUp()

    const response = await client.post('/register', { email: EMAIL, password: PASSWORD })

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ message: 'Check your email to finish registration' })
  })

  it('400 с issues по полям, без введённых значений', async () => {
    const response = await makeClient().post('/register', { email: 'not-an-email', password: '12', displayName: '' })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.issues.map((issue: { path: string[] }) => issue.path.join('.')).sort()).toEqual(['displayName', 'email', 'password'])
    expect(JSON.stringify(body)).not.toContain('not-an-email')
  })
})

describe('POST /api/auth/verify-email', () => {
  it('200: в теле только accessToken и teacher, refresh — в cookie с нужными атрибутами', async () => {
    const response = await makeClient().signUp()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(['accessToken', 'teacher'])
    expect(body.teacher).toEqual({ id: expect.any(String), email: EMAIL, displayName: 'Анна', hasPassword: true, hasGoogle: false })

    const attributes = attributesOf(response)
    expect(attributes[0]).toMatch(new RegExp(`^${REFRESH_COOKIE}=[A-Za-z0-9_-]{43}$`))
    expect(attributes).toEqual(expect.arrayContaining(['Path=/api/auth', 'HttpOnly', 'Secure', 'SameSite=Strict']))
    expect(Math.abs(maxAgeOf(response) - REFRESH_TTL_SECONDS)).toBeLessThanOrEqual(MAX_AGE_TOLERANCE_SECONDS)
    expect(JSON.stringify(body)).not.toContain(cookieOf(response).split('=')[1])
  })

  it('неверный пароль — 400 без cookie', async () => {
    const client = makeClient()
    await client.post('/register', { email: EMAIL, password: PASSWORD })
    await flushBackground()
    const sent = client.email.sent.at(-1)

    const response = await client.post('/verify-email', { token: sent?.kind === 'verification' ? sent.rawToken : '', password: WRONG_PASSWORD })

    expect(response.status).toBe(400)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})

describe('POST /api/auth/login', () => {
  it('200 с cookie; неверный пароль — 401 без cookie', async () => {
    const client = makeClient()
    await client.signUp()

    const ok = await client.post('/login', { email: EMAIL, password: PASSWORD })
    const wrong = await client.post('/login', { email: EMAIL, password: WRONG_PASSWORD })

    expect(ok.status).toBe(200)
    expect(cookieOf(ok)).toMatch(new RegExp(`^${REFRESH_COOKIE}=`))
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ error: 'Wrong email or password' })
    expect(wrong.headers.get('set-cookie')).toBeNull()
  })

  it(`${LOGIN_PER_IP_EMAIL + 1}-я попытка одного email с одного IP — 429 с Retry-After`, async () => {
    const client = makeClient()
    await client.signUp()
    for (let attempt = 0; attempt < LOGIN_PER_IP_EMAIL; attempt++) {
      // Один верный вход в середине не сбрасывает счётчик по IP + email
      const password = attempt === 5 ? PASSWORD : WRONG_PASSWORD
      expect((await client.post('/login', { email: EMAIL, password }, { ip: '192.0.2.10' })).status).not.toBe(429)
    }

    const blocked = await client.post('/login', { email: 'QA-ANNA@example.test', password: PASSWORD }, { ip: '192.0.2.10' })

    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await blocked.json()).toEqual(RATE_LIMITED)
    expect((await client.post('/login', { email: EMAIL, password: PASSWORD }, { ip: '192.0.2.11' })).status).toBe(200)
  })

  it(`${LOGIN_FAILURES_PER_EMAIL} неудач с разных IP — вход по этому email закрыт даже с верным паролем`, async () => {
    const client = makeClient()
    await client.signUp()
    for (let attempt = 0; attempt < LOGIN_FAILURES_PER_EMAIL; attempt++) {
      expect((await client.post('/login', { email: EMAIL, password: WRONG_PASSWORD }, { ip: `198.51.100.${attempt}` })).status).toBe(401)
    }

    const blocked = await client.post('/login', { email: EMAIL, password: PASSWORD }, { ip: '198.51.100.200' })

    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).not.toBeNull()
  })

  it('успешные входы не тратят лимит неудач', async () => {
    const client = makeClient()
    await client.signUp()
    for (let attempt = 0; attempt < LOGIN_FAILURES_PER_EMAIL + 2; attempt++) {
      expect((await client.post('/login', { email: EMAIL, password: PASSWORD }, { ip: `198.51.100.${attempt}` })).status).toBe(200)
    }
  })
})

describe('X-Real-IP', () => {
  it('подделанный заголовок от клиента не обходит лимит по IP + email', async () => {
    const client = makeClient({ trustedProxies: TRUSTED_PROXY, limits: { loginPerIpEmail: STRICT_IP_EMAIL_LIMIT } })
    for (let attempt = 0; attempt < STRICT_IP_EMAIL_LIMIT.max; attempt++) {
      await client.post('/login', { email: EMAIL, password: WRONG_PASSWORD }, { ip: '192.0.2.20', headers: { 'x-real-ip': `203.0.113.${attempt}` } })
    }

    const response = await client.post('/login', { email: EMAIL, password: WRONG_PASSWORD }, { ip: '192.0.2.20', headers: { 'x-real-ip': '203.0.113.99' } })

    expect(response.status).toBe(429)
  })

  it('без списка доверенных прокси X-Real-IP не учитывается: тот же сокет — тот же счётчик', async () => {
    const client = makeClient({ limits: { loginPerIpEmail: STRICT_IP_EMAIL_LIMIT } })
    for (let attempt = 0; attempt < STRICT_IP_EMAIL_LIMIT.max; attempt++) {
      await client.post('/login', { email: EMAIL, password: WRONG_PASSWORD }, { ip: TRUSTED_PROXY, headers: { 'x-real-ip': `203.0.113.${attempt}` } })
    }

    expect((await client.post('/login', { email: EMAIL, password: WRONG_PASSWORD }, { ip: TRUSTED_PROXY, headers: { 'x-real-ip': '203.0.113.99' } })).status).toBe(429)
  })

  it.each([TRUSTED_PROXY, `::ffff:${TRUSTED_PROXY}`])('от доверенного прокси %s — лимит по адресу из X-Real-IP', async (proxy) => {
    const client = makeClient({ trustedProxies: TRUSTED_PROXY, limits: { loginPerIpEmail: STRICT_IP_EMAIL_LIMIT } })
    for (let attempt = 0; attempt < STRICT_IP_EMAIL_LIMIT.max; attempt++) {
      await client.post('/login', { email: 'qa-y@example.test', password: WRONG_PASSWORD }, { ip: proxy, headers: { 'x-real-ip': '203.0.113.1' } })
    }

    const sameClient = await client.post('/login', { email: 'qa-y@example.test', password: WRONG_PASSWORD }, { ip: proxy, headers: { 'x-real-ip': '203.0.113.1' } })
    const otherClient = await client.post('/login', { email: 'qa-y@example.test', password: WRONG_PASSWORD }, { ip: proxy, headers: { 'x-real-ip': '203.0.113.2' } })

    expect(sameClient.status).toBe(429)
    expect(otherClient.status).toBe(401)
  })
})

describe('IPv6: лимит по сети /64', () => {
  const SESSION_PER_IP = 60

  // refresh без cookie: лимит по IP проверяется до всего остального, argon2 не нужен
  function refreshFrom(client: ReturnType<typeof makeClient>, ip: string) {
    return client.app.request('/api/auth/refresh', { method: 'POST', headers: { origin: TEST_WEB_ORIGIN } }, fromIp(ip))
  }

  it(`${SESSION_PER_IP} запросов с 2001:db8::1 — 429, и 2001:db8::2 из той же /64 тоже 429`, async () => {
    const client = makeClient()
    for (let attempt = 0; attempt < SESSION_PER_IP; attempt++) {
      expect((await refreshFrom(client, '2001:db8::1')).status).toBe(401)
    }

    const sameAddress = await refreshFrom(client, '2001:db8::1')
    const sameNetwork = await refreshFrom(client, '2001:0db8:0000:0000:0000:0000:0000:0002')
    const otherNetwork = await refreshFrom(client, '2001:db8:0:1::1')

    expect(sameAddress.status).toBe(429)
    expect(sameAddress.headers.get('retry-after')).not.toBeNull()
    expect(sameNetwork.status).toBe(429)
    expect(otherNetwork.status).toBe(401)
  })
})

describe('POST /api/auth/refresh', () => {
  it('новая cookie; повтор старой — 401, cookie удаляется, семья тоже', async () => {
    const client = makeClient()
    const first = cookieOf(await client.signUp())

    const rotated = await client.withCookie('/refresh', first)
    expect(rotated.status).toBe(200)
    expect(Object.keys(await rotated.json()).sort()).toEqual(['accessToken', 'teacher'])
    const second = cookieOf(rotated)
    expect(second).not.toBe(first)

    const reused = await client.withCookie('/refresh', first)
    expect(reused.status).toBe(401)
    expect(await reused.json()).toEqual(SESSION_INVALID)
    expectClearedCookie(reused)
    expect((await client.withCookie('/refresh', second)).status).toBe(401)
  })

  it.each([
    ['чужой Origin', { origin: EVIL_ORIGIN }],
    ['без Origin', {}],
    ['Origin с другим портом', { origin: 'http://localhost:3001' }],
  ])('%s — 403, токен не тратится', async (_name, headers) => {
    const client = makeClient()
    const cookie = cookieOf(await client.signUp())

    expect((await client.withCookie('/refresh', cookie, headers)).status).toBe(403)
    expect((await client.withCookie('/refresh', cookie)).status).toBe(200)
  })

  it('cookie без префикса __Secure- — 401', async () => {
    const client = makeClient()
    const cookie = cookieOf(await client.signUp()).replace('__Secure-', '')

    const response = await client.withCookie('/refresh', cookie)

    expect(response.status).toBe(401)
  })

  it('без cookie — 401', async () => {
    expect((await makeClient().withCookie('/refresh', undefined)).status).toBe(401)
  })
})

describe('POST /api/auth/logout и logout-all', () => {
  it('logout: 204, cookie удалена, сессия больше не обновляется', async () => {
    const client = makeClient()
    const cookie = cookieOf(await client.signUp())

    const response = await client.withCookie('/logout', cookie)

    expect(response.status).toBe(204)
    expectClearedCookie(response)
    expect((await client.withCookie('/refresh', cookie)).status).toBe(401)
  })

  it('logout без cookie — тоже 204; без Origin — 403', async () => {
    const client = makeClient()

    expect((await client.withCookie('/logout', undefined)).status).toBe(204)
    expect((await client.withCookie('/logout', undefined, {})).status).toBe(403)
  })

  it('logout-all: 204, все сессии учителя закрыты, чужая жива', async () => {
    const client = makeClient()
    const verified = await client.signUp()
    const { accessToken } = await verified.json()
    const phone = cookieOf(await client.post('/login', { email: EMAIL, password: PASSWORD }))
    const boris = cookieOf(await client.signUp('qa-boris@example.test'))

    const response = await client.withBearer('POST', '/logout-all', accessToken)

    expect(response.status).toBe(204)
    expectClearedCookie(response)
    expect((await client.withCookie('/refresh', cookieOf(verified))).status).toBe(401)
    expect((await client.withCookie('/refresh', phone)).status).toBe(401)
    expect((await client.withCookie('/refresh', boris)).status).toBe(200)
  })

  it('logout-all без access-токена — 401', async () => {
    const response = await makeClient().app.request('/api/auth/logout-all', { method: 'POST' }, fromIp())

    expect(response.status).toBe(401)
  })
})

describe('GET /api/auth/me', () => {
  it('200 с teacher', async () => {
    const client = makeClient()
    const { accessToken } = await (await client.signUp()).json()

    const response = await client.withBearer('GET', '/me', accessToken)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      teacher: { id: expect.any(String), email: EMAIL, displayName: 'Анна', hasPassword: true, hasGoogle: false },
    })
  })

  it.each([
    ['без заголовка', undefined],
    ['не Bearer', 'Basic abc'],
    ['мусорный токен', 'Bearer not-a-jwt'],
    ['пустой Bearer', 'Bearer '],
  ])('%s — 401 и WWW-Authenticate: Bearer', async (_name, authorization) => {
    const response = await makeClient().app.request('/api/auth/me', { headers: authorization ? { authorization } : {} }, fromIp())

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
  })
})

describe('CORS', () => {
  function preflight(origin: string) {
    return makeClient().app.request(
      '/api/auth/login',
      { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } },
      fromIp(),
    )
  }

  it('preflight со своего origin — разрешён, с credentials', async () => {
    const response = await preflight(TEST_WEB_ORIGIN)

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(TEST_WEB_ORIGIN)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('preflight с чужого origin — без разрешения', async () => {
    const response = await preflight(EVIL_ORIGIN)

    expect(response.headers.get('access-control-allow-origin')).not.toBe(EVIL_ORIGIN)
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*')
  })
})

describe('нет адреса сокета', () => {
  it('маршрут с лимитом по IP — 500 без деталей, в логе нет email', async () => {
    const logged: unknown[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args)
    })

    const response = await makeClient().app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('{"error":"Internal Server Error"}')
    expect(inspect(logged, { depth: null })).not.toContain(EMAIL)
  })
})
