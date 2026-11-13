import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { type GoogleIdentityProvider, makePasswordHasher, makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import type { GoogleExchangeResult } from '../../src/features/auth/types'
import { flushBackground } from '../fakes/authFakes'
import { makeRecordingEmailSender } from '../fakes/recordingEmailSender'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTestPrisma, truncateAll } from './testDatabase'

// Удаление аккаунта без пароля через Google: маршруты, cookie и база — настоящие, Google подменён провайдером
const STATE = 'qa-reauth-state-0123456789abcdefghijklmnopq'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=qa'
const GOOGLE_SUB = 'google-sub-anna'
const EMAIL = 'qa-anna@gmail.com'
const NAME = 'Анна Ли'
const ACCOUNT_DELETED = `${TEST_WEB_ORIGIN}/auth/account-deleted`
const SIGN_IN_ERROR = `${TEST_WEB_ORIGIN}/auth/login?error=`
const DONE = `${TEST_WEB_ORIGIN}/auth/callback`
const REAUTH_START_PER_IP = 10
const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })
const PASSWORD = 'qa-correct-horse-1957'
const NEW_PASSWORD = 'qa-battery-staple-2031'
const PENDING_TTL_MS = 5 * 60 * 1000

let prisma: PrismaClient

function makeClient(options: { exchange?: () => GoogleExchangeResult; failEmail?: boolean; state?: string } = {}) {
  const email = makeRecordingEmailSender(options.failEmail ? { failWith: new Error('mail down') } : {})
  const state = options.state ?? STATE
  const google: GoogleIdentityProvider = {
    createAuthorizationRequest: () => ({ url: GOOGLE_AUTH_URL, state, codeVerifier: 'qa-verifier', nonce: 'qa-nonce' }),
    async exchangeCode() {
      return options.exchange?.() ?? { ok: true, profile: { googleId: GOOGLE_SUB, email: EMAIL, emailVerified: true, name: NAME } }
    },
  }
  const app = createTestApp({ prisma, emailSender: email.sender, googleIdentity: google })

  function startReauth(accessToken: string | null, body: unknown = {}, ip?: string) {
    const headers: Record<string, string> = { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN }
    if (accessToken !== null) headers.authorization = `Bearer ${accessToken}`
    return app.request('/api/auth/google/reauth/start', { method: 'POST', headers, body: JSON.stringify(body) }, fromIp(ip))
  }

  // cookie __Secure-oauth этого запуска — её присылает браузер на callback
  async function startedCookie(accessToken: string, body: unknown = {}): Promise<string> {
    const response = await startReauth(accessToken, body)
    return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }

  function callback(query: string, cookie: string) {
    return app.request(`/api/auth/google/callback?${query}`, { headers: { cookie } }, fromIp())
  }

  // Обычный вход через Google: cookie без purpose
  async function signInStart(): Promise<string> {
    const response = await app.request('/api/auth/google/start', {}, fromIp())
    return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }

  function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return app.request(
      `/api/auth${path}`,
      { method: 'POST', headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN, ...headers }, body: JSON.stringify(body) },
      fromIp(),
    )
  }

  return { app, email, post, startReauth, startedCookie, callback, signInStart }
}

function cookieNamed(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`))
}

// Учитель без пароля: вход только через Google, как после первого входа через Google
async function googleTeacher(email = EMAIL, displayName: string | null = NAME, googleId = GOOGLE_SUB) {
  return prisma.teacher.create({ data: { email, displayName, passwordHash: null, googleId, emailVerifiedAt: new Date() } })
}

async function accessFor(teacherId: string): Promise<string> {
  return tokens.signAccessToken(teacherId)
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('POST /api/auth/google/reauth/start', () => {
  it('без Bearer — 401, записи нет', async () => {
    const client = makeClient()

    const response = await client.startReauth(null)

    expect(response.status).toBe(401)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
  })

  it('учитель с паролем — 409: удаление по паролю, записи нет', async () => {
    const teacher = await prisma.teacher.create({ data: { email: EMAIL, passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA', emailVerifiedAt: new Date() } })
    const client = makeClient()

    const response = await client.startReauth(await accessFor(teacher.id))

    expect(response.status).toBe(409)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
  })

  it('учитель без пароля — адрес Google в ответе и cookie с purpose reauth, запись по HMAC состояния', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()

    const response = await client.startReauth(await accessFor(teacher.id))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: GOOGLE_AUTH_URL })
    const cookie = cookieNamed(response, '__Secure-oauth') ?? ''
    const value = JSON.parse(Buffer.from(cookie.split('=')[1]!.split(';')[0]!, 'base64url').toString()) as Record<string, unknown>
    expect(value).toMatchObject({ state: STATE, purpose: 'reauth' })
    const row = await prisma.pendingGoogleReauth.findFirst()
    expect(row?.stateHash).toBe(tokens.hashOpaqueToken(STATE))
    expect(row?.stateHash).not.toBe(STATE)
  })

  it('повторный запуск заменяет запись: одна на учителя', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    const access = await accessFor(teacher.id)

    await client.startReauth(access)
    await client.startReauth(access)

    expect(await prisma.pendingGoogleReauth.count({ where: { teacherId: teacher.id } })).toBe(1)
  })

  it(`лимит ${REAUTH_START_PER_IP} запусков на IP — следующий 429`, async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    const access = await accessFor(teacher.id)
    const ip = '192.0.2.91'

    for (let attempt = 0; attempt < REAUTH_START_PER_IP; attempt++) {
      expect((await client.startReauth(access, {}, ip)).status).toBe(200)
    }

    const limited = await client.startReauth(access, {}, ip)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).not.toBeNull()
  })
})

describe('GET /api/auth/google/callback: удаление через Google', () => {
  it('тот же Google-аккаунт — учитель и все его сессии удалены, cookie сняты, редирект на страницу результата', async () => {
    const teacher = await googleTeacher()
    await prisma.refreshToken.create({
      data: { teacherId: teacher.id, familyId: crypto.randomUUID(), tokenHash: '1'.repeat(64), expiresAt: new Date(Date.now() + 86_400_000), familyExpiresAt: new Date(Date.now() + 86_400_000) },
    })
    const client = makeClient()
    const cookie = await client.startedCookie(await accessFor(teacher.id))

    const response = await client.callback(`code=qa-code&state=${STATE}`, cookie)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`${ACCOUNT_DELETED}?status=deleted`)
    expect(await prisma.teacher.count()).toBe(0)
    expect(await prisma.refreshToken.count()).toBe(0)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
    expect(cookieNamed(response, '__Secure-refresh_token')).toContain('Max-Age=0')
    expect(cookieNamed(response, '__Secure-oauth')).toContain('Max-Age=0')
  })

  it('письмо «аккаунт удалён» уходит на языке запуска', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    const cookie = await client.startedCookie(await accessFor(teacher.id), { locale: 'de' })

    const response = await client.callback(`code=qa-code&state=${STATE}`, cookie)
    await flushBackground()

    expect(response.headers.get('location')).toBe(`${TEST_WEB_ORIGIN}/de/auth/account-deleted?status=deleted`)
    expect(client.email.sent).toEqual([{ kind: 'accountDeleted', to: EMAIL, displayName: NAME, locale: 'de' }])
  })

  it('в адресе редиректа и в ответе нет email и имени учителя', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    const cookie = await client.startedCookie(await accessFor(teacher.id))

    const response = await client.callback(`code=qa-code&state=${STATE}`, cookie)

    const location = response.headers.get('location') ?? ''
    expect(location).not.toContain(EMAIL)
    expect(location).not.toContain(encodeURIComponent(NAME))
    expect(location).not.toContain(GOOGLE_SUB)
  })

  it('сбой отправки письма не откатывает удаление', async () => {
    const teacher = await googleTeacher()
    const client = makeClient({ failEmail: true })
    const cookie = await client.startedCookie(await accessFor(teacher.id))

    const response = await client.callback(`code=qa-code&state=${STATE}`, cookie)
    await flushBackground()

    expect(response.headers.get('location')).toBe(`${ACCOUNT_DELETED}?status=deleted`)
    expect(await prisma.teacher.count()).toBe(0)
  })

  it('другой Google-аккаунт (sub не совпадает) — аккаунт цел, подтверждение погашено', async () => {
    const teacher = await googleTeacher()
    const client = makeClient({ exchange: () => ({ ok: true, profile: { googleId: 'google-sub-other', email: 'other@gmail.com', emailVerified: true, name: null } }) })
    const cookie = await client.startedCookie(await accessFor(teacher.id))

    const response = await client.callback(`code=qa-code&state=${STATE}`, cookie)

    expect(response.headers.get('location')).toBe(`${ACCOUNT_DELETED}?error=delete_wrong_account`)
    expect(await prisma.teacher.count()).toBe(1)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
  })

  it('подтверждение истекло — аккаунт цел', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    const cookie = await client.startedCookie(await accessFor(teacher.id))
    // CHECK expires_at > created_at: запись «из прошлого» сдвигаем целиком
    await prisma.pendingGoogleReauth.updateMany({ data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), expiresAt: new Date(Date.now() - 60 * 1000) } })

    const response = await client.callback(`code=qa-code&state=${STATE}`, cookie)

    expect(response.headers.get('location')).toBe(`${ACCOUNT_DELETED}?error=delete_expired`)
    expect(await prisma.teacher.count()).toBe(1)
  })

  it('state в адресе не совпадает с cookie — аккаунт цел, подтверждение погашено', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    const cookie = await client.startedCookie(await accessFor(teacher.id))

    const response = await client.callback('code=qa-code&state=qa-forged-state', cookie)

    expect(response.headers.get('location')).toBe(`${ACCOUNT_DELETED}?error=delete_expired`)
    expect(await prisma.teacher.count()).toBe(1)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
  })

  it('нет cookie запуска — обычная ошибка входа, аккаунт цел', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    await client.startedCookie(await accessFor(teacher.id))

    const response = await client.callback(`code=qa-code&state=${STATE}`, '')

    expect(response.headers.get('location')?.startsWith(SIGN_IN_ERROR)).toBe(true)
    expect(await prisma.teacher.count()).toBe(1)
  })

  it('учитель нажал «Отмена» на экране Google — delete_cancelled, аккаунт цел, подтверждение погашено', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    const cookie = await client.startedCookie(await accessFor(teacher.id))

    const response = await client.callback(`error=access_denied&state=${STATE}`, cookie)

    expect(response.headers.get('location')).toBe(`${ACCOUNT_DELETED}?error=delete_cancelled`)
    expect(await prisma.teacher.count()).toBe(1)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
  })

  it('повтор того же callback — второй получает delete_expired, удаление было один раз', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    const cookie = await client.startedCookie(await accessFor(teacher.id))

    const first = await client.callback(`code=qa-code&state=${STATE}`, cookie)
    const second = await client.callback(`code=qa-code&state=${STATE}`, cookie)
    await flushBackground()

    expect(first.headers.get('location')).toBe(`${ACCOUNT_DELETED}?status=deleted`)
    expect(second.headers.get('location')).toBe(`${ACCOUNT_DELETED}?error=delete_expired`)
    expect(client.email.sent.filter((each) => each.kind === 'accountDeleted')).toHaveLength(1)
  })

  it('два callback одновременно — учитель удалён один раз, один получает отказ', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    const cookie = await client.startedCookie(await accessFor(teacher.id))

    const [first, second] = await Promise.all([
      client.callback(`code=qa-code&state=${STATE}`, cookie),
      client.callback(`code=qa-code&state=${STATE}`, cookie),
    ])
    await flushBackground()

    const locations = [first.headers.get('location'), second.headers.get('location')].sort()
    expect(locations).toEqual([`${ACCOUNT_DELETED}?error=delete_expired`, `${ACCOUNT_DELETED}?status=deleted`].sort())
    expect(await prisma.teacher.count()).toBe(0)
  })

  it('запись другого учителя не подходит: удаляется только тот, чей запуск', async () => {
    const anna = await googleTeacher()
    const boris = await googleTeacher('qa-boris@gmail.com', 'Борис', 'google-sub-boris')
    const client = makeClient()
    const annaCookie = await client.startedCookie(await accessFor(anna.id))
    // Запуск Бориса — с другим state: у каждого запуска свой
    await makeClient({ state: 'qa-boris-state-0123456789abcdefghijklmnop' }).startedCookie(await accessFor(boris.id))

    const response = await client.callback(`code=qa-code&state=${STATE}`, annaCookie)

    expect(response.headers.get('location')).toBe(`${ACCOUNT_DELETED}?status=deleted`)
    expect(await prisma.teacher.findUnique({ where: { id: anna.id } })).toBeNull()
    expect(await prisma.teacher.findUnique({ where: { id: boris.id } })).not.toBeNull()
    expect(await prisma.pendingGoogleReauth.count({ where: { teacherId: boris.id } })).toBe(1)
  })

  it('обычный вход через Google не затронут запуском удаления: учитель входит, ничего не удаляется', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    await client.startedCookie(await accessFor(teacher.id))
    const signIn = await client.signInStart()

    const response = await client.callback(`code=qa-code&state=${STATE}`, signIn)

    expect(response.headers.get('location')).toBe(DONE)
    expect(await prisma.teacher.count()).toBe(1)
  })

  it('у учителя появился пароль после запуска — delete_has_password, аккаунт цел, подтверждение погашено', async () => {
    const teacher = await googleTeacher()
    const client = makeClient()
    const cookie = await client.startedCookie(await accessFor(teacher.id))
    await prisma.teacher.update({ where: { id: teacher.id }, data: { passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA' } })

    const response = await client.callback(`code=qa-code&state=${STATE}`, cookie)

    expect(response.headers.get('location')).toBe(`${ACCOUNT_DELETED}?error=delete_has_password`)
    expect(await prisma.teacher.count()).toBe(1)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
  })

  // Сброс пароля и смена пароля гасят подтверждение: после них callback не удаляет аккаунт
  it('сброс пароля по письму гасит подтверждение удаления: callback после него — delete_expired, аккаунт цел', async () => {
    const hasher = await makePasswordHasher()
    const teacher = await prisma.teacher.create({
      data: { email: EMAIL, passwordHash: await hasher.hash(PASSWORD), googleId: GOOGLE_SUB, displayName: NAME, emailVerifiedAt: new Date() },
    })
    await prisma.pendingGoogleReauth.create({
      data: { teacherId: teacher.id, stateHash: tokens.hashOpaqueToken(STATE), createdAt: new Date(), expiresAt: new Date(Date.now() + PENDING_TTL_MS) },
    })
    const client = makeClient()
    await client.post('/forgot-password', { email: EMAIL })
    await flushBackground()
    const reset = client.email.sent.find((each) => each.kind === 'passwordReset')
    const resetResponse = await client.post('/reset-password', { token: reset?.kind === 'passwordReset' ? reset.rawToken : '', password: NEW_PASSWORD })
    expect(resetResponse.status).toBe(204)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
    const cookie = `__Secure-oauth=${Buffer.from(JSON.stringify({ state: STATE, codeVerifier: 'qa-verifier', nonce: 'qa-nonce', locale: 'ru', purpose: 'reauth' })).toString('base64url')}`

    const response = await client.callback(`code=qa-code&state=${STATE}`, cookie)

    expect(response.headers.get('location')).toBe(`${ACCOUNT_DELETED}?error=delete_expired`)
    expect(await prisma.teacher.count({ where: { id: teacher.id } })).toBe(1)
  })

  it('смена пароля гасит подтверждение удаления: callback после неё — delete_expired, аккаунт цел', async () => {
    const hasher = await makePasswordHasher()
    const teacher = await prisma.teacher.create({
      data: { email: EMAIL, passwordHash: await hasher.hash(PASSWORD), googleId: GOOGLE_SUB, displayName: NAME, emailVerifiedAt: new Date() },
    })
    // Запуск удаления учитель начал до появления пароля: запись создаём напрямую
    await prisma.pendingGoogleReauth.create({
      data: { teacherId: teacher.id, stateHash: tokens.hashOpaqueToken(STATE), createdAt: new Date(), expiresAt: new Date(Date.now() + PENDING_TTL_MS) },
    })
    const client = makeClient()

    const changed = await client.post('/change-password', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }, { authorization: `Bearer ${await accessFor(teacher.id)}` })
    expect(changed.status).toBe(200)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)

    // Cookie того запуска, который начат до смены пароля (startReauth у учителя с паролем не выдаст его)
    const cookie = `__Secure-oauth=${Buffer.from(JSON.stringify({ state: STATE, codeVerifier: 'qa-verifier', nonce: 'qa-nonce', locale: 'ru', purpose: 'reauth' })).toString('base64url')}`
    const response = await client.callback(`code=qa-code&state=${STATE}`, cookie)

    expect(response.headers.get('location')).toBe(`${ACCOUNT_DELETED}?error=delete_expired`)
    expect(await prisma.teacher.count({ where: { id: teacher.id } })).toBe(1)
  })
})
