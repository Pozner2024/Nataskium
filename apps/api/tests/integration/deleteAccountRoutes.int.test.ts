import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { flushBackground } from '../fakes/authFakes'
import { makeRecordingEmailSender } from '../fakes/recordingEmailSender'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTestPrisma, truncateAll } from './testDatabase'

const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const DELETE_ACCOUNT_PER_IP = 10
const SESSION_INVALID = { error: 'Session is invalid or expired, sign in again' }
const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })

let prisma: PrismaClient

function makeClient() {
  const email = makeRecordingEmailSender()
  const app = createTestApp({ prisma, emailSender: email.sender })

  function post(path: string, body: unknown, headers: Record<string, string> = {}, ip?: string) {
    return app.request(
      `/api/auth${path}`,
      { method: 'POST', headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN, ...headers }, body: JSON.stringify(body) },
      fromIp(ip),
    )
  }

  function deleteAccount(accessToken: string, password: string, ip?: string) {
    return post('/delete-account', { password }, { authorization: `Bearer ${accessToken}` }, ip)
  }

  // Регистрация и подтверждение: access-токен и refresh-cookie учителя с паролем
  async function signUp() {
    await post('/register', { email: EMAIL, password: PASSWORD, displayName: 'Анна' })
    await flushBackground()
    const sent = email.sent.find((each) => each.kind === 'verification')
    const verified = await post('/verify-email', { token: sent?.kind === 'verification' ? sent.rawToken : '', password: PASSWORD })
    const { accessToken, teacher } = (await verified.json()) as { accessToken: string; teacher: { id: string } }
    const refreshCookie = (verified.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    return { accessToken, teacherId: teacher.id, refreshCookie }
  }

  return { app, post, deleteAccount, signUp }
}

function clearedCookie(response: Response, name: string) {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`))
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('POST /api/auth/delete-account', () => {
  it('204: учителя нет, refresh-cookie и cookie привязки Google стёрты', async () => {
    const client = makeClient()
    const { accessToken, teacherId } = await client.signUp()

    const response = await client.deleteAccount(accessToken, PASSWORD)

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(await prisma.teacher.count({ where: { id: teacherId } })).toBe(0)
    for (const [name, path] of [['__Secure-refresh_token', 'Path=/api/auth'], ['__Secure-google_link', 'Path=/api/auth/google']]) {
      const cookie = clearedCookie(response, name)
      expect(cookie, name).toBeDefined()
      expect(cookie).toContain('Max-Age=0')
      expect(cookie).toContain(path)
    }
  })

  it('после удаления: повтор тем же токеном, /me и refresh — 401; вход со старым паролем — 401', async () => {
    const client = makeClient()
    const { accessToken, refreshCookie } = await client.signUp()
    await client.deleteAccount(accessToken, PASSWORD)

    const again = await client.deleteAccount(accessToken, PASSWORD)
    const me = await client.app.request('/api/auth/me', { headers: { authorization: `Bearer ${accessToken}` } }, fromIp())
    const refresh = await client.post('/refresh', undefined, { cookie: refreshCookie })
    const login = await client.post('/login', { email: EMAIL, password: PASSWORD })

    expect(again.status).toBe(401)
    expect(await again.json()).toEqual(SESSION_INVALID)
    expect(me.status).toBe(401)
    expect(refresh.status).toBe(401)
    expect(login.status).toBe(401)
    expect(await login.json()).toEqual({ error: 'Wrong email or password' })
  })

  it('после удаления тот же email можно зарегистрировать заново', async () => {
    const client = makeClient()
    const { accessToken } = await client.signUp()
    await client.deleteAccount(accessToken, PASSWORD)

    expect((await client.post('/register', { email: EMAIL, password: PASSWORD })).status).toBe(202)
  })

  it('неверный пароль — 400 «Wrong password» (не 401), аккаунт и сессия целы', async () => {
    const client = makeClient()
    const { accessToken, teacherId } = await client.signUp()

    const response = await client.deleteAccount(accessToken, 'qa-wrong-password')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Wrong password' })
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await prisma.teacher.count({ where: { id: teacherId } })).toBe(1)
    const me = await client.app.request('/api/auth/me', { headers: { authorization: `Bearer ${accessToken}` } }, fromIp())
    expect(me.status).toBe(200)
  })

  it('учитель только с Google — 409', async () => {
    const teacher = await prisma.teacher.create({ data: { email: EMAIL, googleId: 'google-sub-anna', emailVerifiedAt: new Date() } })
    const client = makeClient()

    const response = await client.deleteAccount(await tokens.signAccessToken(teacher.id), PASSWORD)

    expect(response.status).toBe(409)
    expect(await prisma.teacher.count()).toBe(1)
  })

  it.each([
    ['без access-токена', {}],
    ['мусорный токен', { authorization: 'Bearer not-a-jwt' }],
  ])('%s — 401 с WWW-Authenticate: Bearer', async (_name, headers) => {
    const response = await makeClient().post('/delete-account', { password: PASSWORD }, headers)

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('пустой пароль — 400 с issues', async () => {
    const client = makeClient()
    const { accessToken } = await client.signUp()

    const response = await client.deleteAccount(accessToken, '')

    expect(response.status).toBe(400)
    expect((await response.json()).issues.map((issue: { path: string[] }) => issue.path.join('.'))).toEqual(['password'])
  })

  it(`${DELETE_ACCOUNT_PER_IP + 1}-я попытка с одного IP за 15 мин — 429 с Retry-After`, async () => {
    const client = makeClient()
    const { accessToken } = await client.signUp()
    for (let attempt = 0; attempt < DELETE_ACCOUNT_PER_IP; attempt++) {
      expect((await client.post('/delete-account', { password: 'x' }, { authorization: 'Bearer not-a-jwt' }, '192.0.2.60')).status).toBe(401)
    }

    const blocked = await client.deleteAccount(accessToken, PASSWORD, '192.0.2.60')

    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).not.toBeNull()
    expect(await prisma.teacher.count()).toBe(1)
  })

  it('неверный пароль засчитывается в общий лимит неудач по email: после 10 — 429 и на входе', async () => {
    const client = makeClient()
    const { accessToken } = await client.signUp()
    for (let attempt = 0; attempt < 10; attempt++) {
      await client.deleteAccount(accessToken, 'qa-wrong-password', `198.51.100.${attempt}`)
    }

    const login = await client.app.request(
      '/api/auth/login',
      { method: 'POST', headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
      fromIp('198.51.100.200'),
    )
    expect(login.status).toBe(429)
  })
})

// Гонка «нашли учителя → его удалили → записали»: клиент Prisma удаляет учителя сразу после первого поиска по нему
function prismaDeletingTeacherAfterLookup(teacherId: string): PrismaClient {
  let armed = true
  return prisma.$extends({
    query: {
      teacher: {
        async findUnique({ args, query }) {
          const found = await query(args)
          if (armed && found !== null) {
            armed = false
            await prisma.teacher.delete({ where: { id: teacherId } })
          }
          return found
        },
      },
    },
  }) as unknown as PrismaClient
}

describe('учителя удалили посреди запроса — 401, не 500', () => {
  it('login: учитель найден и пароль верен, но сессию записать некому — 401 «сессия недействительна», без cookie', async () => {
    const { teacherId } = await makeClient().signUp()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = createTestApp({ prisma: prismaDeletingTeacherAfterLookup(teacherId) })

    const response = await app.request(
      '/api/auth/login',
      { method: 'POST', headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
      fromIp(),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual(SESSION_INVALID)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await prisma.teacher.count()).toBe(0)
    expect(await prisma.refreshToken.count()).toBe(0)
    expect(errors).not.toHaveBeenCalled()
  })

  it('refresh: токен и учитель найдены, учителя удалили до ротации — 401, новых токенов нет', async () => {
    const { teacherId, refreshCookie } = await makeClient().signUp()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const app = createTestApp({ prisma: prismaDeletingTeacherAfterLookup(teacherId) })

    const response = await app.request(
      '/api/auth/refresh',
      { method: 'POST', headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN, cookie: refreshCookie } },
      fromIp(),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual(SESSION_INVALID)
    expect(await prisma.refreshToken.count()).toBe(0)
    expect(errors).not.toHaveBeenCalled()
  })
})
