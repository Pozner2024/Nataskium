import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { flushBackground } from '../fakes/authFakes'
import { makeRecordingEmailSender } from '../fakes/recordingEmailSender'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTestPrisma, truncateAll } from './testDatabase'

const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const NEW_PASSWORD = 'qa-battery-staple-2031'
const CHANGE_PASSWORD_PER_IP = 10
const REFRESH_COOKIE = '__Secure-refresh_token'
const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })

let prisma: PrismaClient

function cookiePair(response: Response, name: string): string {
  const cookie = response.headers.getSetCookie().find((each) => each.startsWith(`${name}=`))
  return cookie?.split(';')[0] ?? ''
}

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

  function changePassword(accessToken: string, currentPassword: string, newPassword = NEW_PASSWORD, ip?: string) {
    return post('/change-password', { currentPassword, newPassword }, { authorization: `Bearer ${accessToken}` }, ip)
  }

  async function signUp() {
    await post('/register', { email: EMAIL, password: PASSWORD, displayName: 'Анна' })
    await flushBackground()
    const sent = email.sent.find((each) => each.kind === 'verification')
    const verified = await post('/verify-email', { token: sent?.kind === 'verification' ? sent.rawToken : '', password: PASSWORD })
    const { accessToken, teacher } = (await verified.json()) as { accessToken: string; teacher: { id: string } }
    return { accessToken, teacherId: teacher.id, refreshCookie: cookiePair(verified, REFRESH_COOKIE) }
  }

  return { app, email, post, changePassword, signUp }
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('POST /api/auth/change-password', () => {
  it('200: новая сессия в теле и cookie, сырого refresh-токена в теле нет', async () => {
    const client = makeClient()
    const { accessToken, teacherId } = await client.signUp()

    const response = await client.changePassword(accessToken, PASSWORD)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Object.keys(body).sort()).toEqual(['accessToken', 'teacher'])
    expect(body.teacher).toMatchObject({ id: teacherId, email: EMAIL, hasPassword: true })
    const cookie = response.headers.getSetCookie().find((each) => each.startsWith(`${REFRESH_COOKIE}=`))
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/api/auth')
    expect(JSON.stringify(body)).not.toContain(cookiePair(response, REFRESH_COOKIE).split('=')[1])
  })

  it('вход работает только с новым паролем', async () => {
    const client = makeClient()
    const { accessToken } = await client.signUp()
    await client.changePassword(accessToken, PASSWORD)

    expect((await client.post('/login', { email: EMAIL, password: PASSWORD })).status).toBe(401)
    expect((await client.post('/login', { email: EMAIL, password: NEW_PASSWORD })).status).toBe(200)
  })

  it('прежние сессии (другие устройства) удалены, новая cookie этого браузера работает', async () => {
    const client = makeClient()
    const { accessToken, refreshCookie, teacherId } = await client.signUp()
    const otherDevice = await client.post('/login', { email: EMAIL, password: PASSWORD })

    const response = await client.changePassword(accessToken, PASSWORD)

    expect(await prisma.refreshToken.count({ where: { teacherId } })).toBe(1)
    expect((await client.post('/refresh', undefined, { cookie: refreshCookie })).status).toBe(401)
    expect((await client.post('/refresh', undefined, { cookie: cookiePair(otherDevice, REFRESH_COOKIE) })).status).toBe(401)
    expect((await client.post('/refresh', undefined, { cookie: cookiePair(response, REFRESH_COOKIE) })).status).toBe(200)
  })

  it('ссылка сброса, запрошенная до смены, больше не работает', async () => {
    const client = makeClient()
    const { accessToken, teacherId } = await client.signUp()
    await client.post('/forgot-password', { email: EMAIL })
    await flushBackground()
    const reset = client.email.sent.find((each) => each.kind === 'passwordReset')

    await client.changePassword(accessToken, PASSWORD)
    const response = await client.post('/reset-password', { token: reset?.kind === 'passwordReset' ? reset.rawToken : '', password: 'qa-third-password-77' })

    expect(await prisma.passwordReset.count({ where: { teacherId } })).toBe(0)
    expect(response.status).toBe(400)
  })

  it('учителю уходит письмо о смене пароля', async () => {
    const client = makeClient()
    const { accessToken } = await client.signUp()

    await client.changePassword(accessToken, PASSWORD)
    await flushBackground()

    expect(client.email.sent.filter((each) => each.kind === 'passwordChanged')).toEqual([
      { kind: 'passwordChanged', to: EMAIL, displayName: 'Анна', locale: 'ru' },
    ])
  })

  it('неверный текущий пароль — 400 «Wrong password» (не 401), пароль и сессия целы', async () => {
    const client = makeClient()
    const { accessToken, refreshCookie } = await client.signUp()

    const response = await client.changePassword(accessToken, 'qa-wrong-password')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Wrong password' })
    expect(response.headers.get('set-cookie')).toBeNull()
    expect((await client.post('/refresh', undefined, { cookie: refreshCookie })).status).toBe(200)
    expect((await client.post('/login', { email: EMAIL, password: PASSWORD })).status).toBe(200)
  })

  it.each([
    ['короткий', 'abc'],
    ['из списка запрещённых', 'password'],
  ])('новый пароль %s — 400 с issues по newPassword, пароль прежний', async (_name, newPassword) => {
    const client = makeClient()
    const { accessToken } = await client.signUp()

    const response = await client.changePassword(accessToken, PASSWORD, newPassword)

    expect(response.status).toBe(400)
    expect((await response.json()).issues.map((issue: { path: string[] }) => issue.path.join('.'))).toEqual(['newPassword'])
    expect((await client.post('/login', { email: EMAIL, password: PASSWORD })).status).toBe(200)
  })

  it('учитель только с Google — 409', async () => {
    const teacher = await prisma.teacher.create({ data: { email: EMAIL, googleId: 'google-sub-anna', emailVerifiedAt: new Date() } })
    const client = makeClient()

    const response = await client.changePassword(await tokens.signAccessToken(teacher.id), PASSWORD)

    expect(response.status).toBe(409)
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).passwordHash).toBeNull()
  })

  it.each([
    ['без access-токена', {}],
    ['мусорный токен', { authorization: 'Bearer not-a-jwt' }],
  ])('%s — 401 с WWW-Authenticate: Bearer', async (_name, headers) => {
    const response = await makeClient().post('/change-password', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }, headers)

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('access-токен удалённого учителя — 401, не 500', async () => {
    const client = makeClient()
    const { accessToken, teacherId } = await client.signUp()
    await prisma.teacher.delete({ where: { id: teacherId } })

    expect((await client.changePassword(accessToken, PASSWORD)).status).toBe(401)
  })

  it(`${CHANGE_PASSWORD_PER_IP + 1}-я попытка с одного IP за 15 мин — 429 с Retry-After`, async () => {
    const client = makeClient()
    const { accessToken } = await client.signUp()
    for (let attempt = 0; attempt < CHANGE_PASSWORD_PER_IP; attempt++) {
      await client.post('/change-password', {}, { authorization: 'Bearer not-a-jwt' }, '192.0.2.61')
    }

    const blocked = await client.changePassword(accessToken, PASSWORD, NEW_PASSWORD, '192.0.2.61')

    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).not.toBeNull()
    expect((await client.post('/login', { email: EMAIL, password: PASSWORD })).status).toBe(200)
  })

  it('неверный текущий пароль засчитывается в лимит неудач по id учителя: после 10 — 429 на смене, вход по email не затронут', async () => {
    const client = makeClient()
    const { accessToken } = await client.signUp()
    for (let attempt = 0; attempt < 10; attempt++) {
      await client.changePassword(accessToken, 'qa-wrong-password', NEW_PASSWORD, `198.51.100.${attempt}`)
    }

    expect((await client.changePassword(accessToken, PASSWORD, NEW_PASSWORD, '198.51.100.200')).status).toBe(429)
    expect((await client.post('/login', { email: EMAIL, password: PASSWORD }, {}, '198.51.100.201')).status).toBe(200)
  })
})
