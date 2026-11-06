import { inspect } from 'node:util'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { type GoogleIdentityProvider, makePasswordHasher, makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import type { GoogleExchangeResult } from '../../src/features/auth/types'
import { ExternalServiceError } from '../../src/shared/errors'
import { flushBackground } from '../fakes/authFakes'
import { makeRecordingEmailSender } from '../fakes/recordingEmailSender'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTestPrisma, truncateAll } from './testDatabase'

// Google подменяется провайдером из теста: маршруты, cookie и база — настоящие
const STATE = 'qa-state-0123456789abcdefghijklmnopqrstuvwxy'
const VERIFIER = 'qa-verifier-0123456789abcdefghijklmnopqrstu'
const NONCE = 'qa-nonce-0123456789abcdefghijklmnopqrstuvwx'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=qa'
const EMAIL = 'qa-anna@gmail.com'
const SIGN_IN_ERROR = `${TEST_WEB_ORIGIN}/auth/login?error=`
const DONE = `${TEST_WEB_ORIGIN}/auth/callback`
const OAUTH_COOKIE_MAX_AGE = 300
const LINK_PAGE = `${TEST_WEB_ORIGIN}/auth/link-google#token=`
const LINK_TTL_MS = 10 * 60 * 1000
const WRONG_LOGIN = { error: 'Wrong email or password' }
const GOOGLE_LINK_PER_IP = 30
const LOGIN_FAILURES_PER_EMAIL = 10
const PASSWORD = 'qa-correct-horse-1957'
const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })

let prisma: PrismaClient

function makeClient(exchange: () => Promise<GoogleExchangeResult>) {
  const email = makeRecordingEmailSender()
  const seen: { code?: string; codeVerifier?: string; nonce?: string }[] = []
  const google: GoogleIdentityProvider = {
    createAuthorizationRequest: () => ({ url: GOOGLE_AUTH_URL, state: STATE, codeVerifier: VERIFIER, nonce: NONCE }),
    async exchangeCode(code, codeVerifier, nonce) {
      seen.push({ code, codeVerifier, nonce })
      return exchange()
    },
  }
  const app = createTestApp({ prisma, emailSender: email.sender, googleIdentity: google })
  const get = (path: string, cookie?: string) =>
    app.request(`/api/auth/google${path}`, { headers: cookie === undefined ? {} : { cookie } }, fromIp())

  async function start(): Promise<string> {
    const response = await get('/start')
    return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }

  // cookie __Secure-google_link браузера, в котором прошёл последний callback привязки
  const browser = { linkCookie: '' }

  // cookie: по умолчанию — этого браузера; null — запрос без неё (чужой браузер); строка — подменённая
  function postLink(body: unknown, ip?: string, cookie: string | null = browser.linkCookie) {
    const headers: Record<string, string> = { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN }
    if (cookie !== null && cookie !== '') headers.cookie = cookie
    return app.request('/api/auth/google/link', { method: 'POST', headers, body: JSON.stringify(body) }, fromIp(ip))
  }

  // Полный callback до редиректа на страницу привязки: сырой токен — из фрагмента Location, секрет — из cookie
  async function callbackForLink(): Promise<string> {
    const response = await get(`/callback?code=qa-code&state=${STATE}`, await start())
    const location = response.headers.get('location') ?? ''
    if (!location.startsWith(LINK_PAGE)) throw new Error(`no link redirect: ${location}`)
    browser.linkCookie = (response.headers.getSetCookie().find((each) => each.startsWith('__Secure-google_link=')) ?? '').split(';')[0] ?? ''
    return decodeURIComponent(location.slice(LINK_PAGE.length))
  }

  return { app, email, seen, get, start, postLink, callbackForLink, browser }
}

function verified(overrides: Partial<{ googleId: string; email: string; emailVerified: boolean; name: string | null }> = {}): () => Promise<GoogleExchangeResult> {
  return async () => ({ ok: true, profile: { googleId: 'google-sub-anna', email: EMAIL, emailVerified: true, name: 'Анна', ...overrides } })
}

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie()
}

function expectOAuthCookieCleared(response: Response) {
  const cleared = setCookies(response).find((cookie) => cookie.startsWith('__Secure-oauth='))
  expect(cleared).toBeDefined()
  expect(cleared).toContain('Max-Age=0')
  expect(cleared).toContain('Path=/api/auth/google')
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('GET /api/auth/google/start', () => {
  it('302 на Google и cookie __Secure-oauth: HttpOnly, Secure, SameSite=Lax, Path=/api/auth/google, Max-Age=300', async () => {
    const response = await makeClient(verified()).get('/start')

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(GOOGLE_AUTH_URL)
    const [cookie] = setCookies(response)
    const attributes = (cookie ?? '').split(';').map((part) => part.trim())
    expect(attributes[0]).toMatch(/^__Secure-oauth=[A-Za-z0-9_-]+$/)
    expect(attributes).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/auth/google', `Max-Age=${OAUTH_COOKIE_MAX_AGE}`]))
  })

  it('в cookie — state, verifier и nonce этого входа; в URL их verifier нет', async () => {
    const client = makeClient(verified())
    const cookie = await client.start()

    const value = JSON.parse(Buffer.from(cookie.split('=')[1] ?? '', 'base64url').toString())

    expect(value).toEqual({ state: STATE, codeVerifier: VERIFIER, nonce: NONCE })
  })

  it('без настроенного Google маршрутов нет — 404', async () => {
    const app = createTestApp({ prisma })

    expect((await app.request('/api/auth/google/start', {}, fromIp())).status).toBe(404)
    expect((await app.request('/api/auth/google/callback?code=x&state=y', {}, fromIp())).status).toBe(404)
  })
})

describe('GET /api/auth/google/callback: успех', () => {
  it('новый учитель: 302 на /auth/callback без токенов в URL, refresh-cookie, oauth-cookie удалена', async () => {
    const client = makeClient(verified())
    const cookie = await client.start()

    const response = await client.get(`/callback?code=qa-code&state=${STATE}`, cookie)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(DONE)
    const refresh = setCookies(response).find((each) => each.startsWith('__Secure-refresh_token='))
    expect(refresh).toMatch(/^__Secure-refresh_token=[A-Za-z0-9_-]{43};/)
    expectOAuthCookieCleared(response)
    expect(client.seen).toEqual([{ code: 'qa-code', codeVerifier: VERIFIER, nonce: NONCE }])
    expect(await prisma.teacher.findUnique({ where: { email: EMAIL } })).toMatchObject({ passwordHash: null, googleId: 'google-sub-anna' })
  })

  it('refresh-cookie после Google работает: /refresh отдаёт учителя с hasGoogle', async () => {
    const client = makeClient(verified())
    const response = await client.get(`/callback?code=qa-code&state=${STATE}`, await client.start())
    const refresh = (setCookies(response).find((each) => each.startsWith('__Secure-refresh_token=')) ?? '').split(';')[0] ?? ''

    const next = await client.app.request('/api/auth/refresh', { method: 'POST', headers: { cookie: refresh, origin: TEST_WEB_ORIGIN } }, fromIp())

    expect(next.status).toBe(200)
    expect((await next.json()).teacher).toMatchObject({ email: EMAIL, hasGoogle: true, hasPassword: false })
  })

  it('учитель только с Google (уже есть) входит сразу', async () => {
    await prisma.teacher.create({ data: { email: EMAIL, googleId: 'google-sub-anna', emailVerifiedAt: new Date() } })
    const client = makeClient(verified())

    const response = await client.get(`/callback?code=qa-code&state=${STATE}`, await client.start())

    expect(response.headers.get('location')).toBe(DONE)
    expect(await prisma.pendingGoogleLink.count()).toBe(0)
  })
})

describe('GET /api/auth/google/callback: ошибки — редирект на страницу входа с кодом, без деталей', () => {
  async function callbackError(client: ReturnType<typeof makeClient>, query: string, cookie?: string) {
    const response = await client.get(`/callback?${query}`, cookie)
    expect(response.status).toBe(302)
    expectOAuthCookieCleared(response)
    expect(setCookies(response).some((each) => each.startsWith('__Secure-refresh_token=') && !each.includes('Max-Age=0'))).toBe(false)
    return response.headers.get('location')
  }

  it('?error= (учитель нажал «Отмена») — google_cancelled, обмена кода нет', async () => {
    const client = makeClient(verified())

    expect(await callbackError(client, `error=access_denied&state=${STATE}`, await client.start())).toBe(`${SIGN_IN_ERROR}google_cancelled`)
    expect(client.seen).toEqual([])
  })

  it.each([
    ['чужой state', `code=qa-code&state=other-state`, 'cookie'],
    ['нет cookie', `code=qa-code&state=${STATE}`, 'none'],
    ['битая cookie: не base64url JSON', `code=qa-code&state=${STATE}`, '__Secure-oauth=%%%not-base64'],
    ['cookie без nonce', `code=qa-code&state=${STATE}`, `__Secure-oauth=${Buffer.from(JSON.stringify({ state: STATE, codeVerifier: VERIFIER })).toString('base64url')}`],
    ['cookie без префикса __Secure-', `code=qa-code&state=${STATE}`, 'plain'],
    ['нет code', `state=${STATE}`, 'cookie'],
    ['нет state', 'code=qa-code', 'cookie'],
    ['слишком длинный code', `code=${'c'.repeat(3000)}&state=${STATE}`, 'cookie'],
  ])('%s — google_state, без 500 и без обмена кода', async (_name, query, cookieKind) => {
    const client = makeClient(verified())
    const real = await client.start()
    const cookie = cookieKind === 'cookie' ? real : cookieKind === 'none' ? undefined : cookieKind === 'plain' ? real.replace('__Secure-', '') : cookieKind

    expect(await callbackError(client, query, cookie)).toBe(`${SIGN_IN_ERROR}google_state`)
    expect(client.seen).toEqual([])
  })

  it.each<[string, () => Promise<GoogleExchangeResult>, string]>([
    ['id_token не прошёл проверку', async () => ({ ok: false, reason: 'invalidToken' }), 'google_failed'],
    ['почта в Google не подтверждена', verified({ emailVerified: false }), 'google_email_unverified'],
    ['email из Google не проходит схему', verified({ email: 'not-an-email' }), 'google_failed'],
    ['Google недоступен', async () => Promise.reject(new ExternalServiceError('google', 503)), 'google_unavailable'],
    ['неожиданная ошибка', async () => Promise.reject(new Error(`boom ${EMAIL}`)), 'google_unavailable'],
  ])('%s — %s', async (_name, exchange, code) => {
    const client = makeClient(exchange)

    expect(await callbackError(client, `code=qa-code&state=${STATE}`, await client.start())).toBe(`${SIGN_IN_ERROR}${code}`)
  })

  it('у учителя с этим email другой Google-аккаунт — google_account_conflict', async () => {
    await prisma.teacher.create({ data: { email: EMAIL, googleId: 'google-sub-other', emailVerifiedAt: new Date() } })
    const client = makeClient(verified())

    expect(await callbackError(client, `code=qa-code&state=${STATE}`, await client.start())).toBe(`${SIGN_IN_ERROR}google_account_conflict`)
  })

  it('сбой Google — в логе только тип и статус, без кода, email и verifier', async () => {
    const logged: unknown[] = []
    vi.mocked(console.error).mockImplementation((...args: unknown[]) => {
      logged.push(args)
    })
    const client = makeClient(async () => Promise.reject(new ExternalServiceError('google', 503)))

    await client.get(`/callback?code=qa-secret-code&state=${STATE}`, await client.start())

    expect(logged).toEqual([['Google sign-in failed', { errorType: 'ExternalServiceError', status: 503 }]])
    expect(inspect(logged, { depth: null })).not.toContain('qa-secret-code')
  })

  it('oauth-cookie одноразовая: повтор того же callback — google_state', async () => {
    const client = makeClient(verified())
    const cookie = await client.start()
    const first = await client.get(`/callback?code=qa-code&state=${STATE}`, cookie)
    expect(first.headers.get('location')).toBe(DONE)

    // Браузер уже удалил cookie: повтор (кнопка «назад») приходит без неё
    expect(await callbackError(client, `code=qa-code&state=${STATE}`)).toBe(`${SIGN_IN_ERROR}google_state`)
  })
})

// Атакующий проходит Google своим аккаунтом с email учителя и шлёт учителю ссылку /auth/link-google#token=…:
// без cookie того входа ссылка не сработает, даже если учитель введёт верный пароль
describe('привязка Google: ссылка из чужого браузера (CSRF)', () => {
  async function teacherWithPassword() {
    const hasher = await makePasswordHasher()
    return prisma.teacher.create({
      data: { email: EMAIL, passwordHash: await hasher.hash(PASSWORD), displayName: 'Анна Ли', emailVerifiedAt: new Date() },
    })
  }

  it.each([
    ['без cookie', () => null],
    ['с cookie другого входа', () => `__Secure-google_link=${'B'.repeat(43)}`],
    ['cookie без префикса __Secure-', (own: string) => own.replace('__Secure-', '')],
  ])('%s и верным паролем — тот же 400, googleId null, ссылка цела', async (_name, makeCookie) => {
    const teacher = await teacherWithPassword()
    const attacker = makeClient(verified())
    const token = await attacker.callbackForLink()

    const response = await attacker.postLink({ token, password: PASSWORD }, undefined, makeCookie(attacker.browser.linkCookie))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(WRONG_LOGIN)
    expect(setCookies(response).some((each) => each.startsWith('__Secure-refresh_token='))).toBe(false)
    expect((await prisma.teacher.findUnique({ where: { id: teacher.id } }))?.googleId).toBeNull()
    expect(await prisma.pendingGoogleLink.count()).toBe(1)
  })

  it(`неудачи из чужого браузера не засчитываются: после ${LOGIN_FAILURES_PER_EMAIL + 2} попыток учитель входит по паролю`, async () => {
    await teacherWithPassword()
    const attacker = makeClient(verified())
    const token = await attacker.callbackForLink()
    for (let attempt = 0; attempt < LOGIN_FAILURES_PER_EMAIL + 2; attempt++) {
      expect((await attacker.postLink({ token, password: 'qa-wrong-password' }, `203.0.113.${attempt}`, null)).status).toBe(400)
    }

    const login = await attacker.app.request(
      '/api/auth/login',
      { method: 'POST', headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
      fromIp('203.0.113.200'),
    )
    expect(login.status).toBe(200)
  })

  it('cookie чужого входа того же учителя не подходит к этой ссылке', async () => {
    await teacherWithPassword()
    const first = makeClient(verified())
    await first.callbackForLink()
    const otherCookie = first.browser.linkCookie
    const second = makeClient(verified())
    const token = await second.callbackForLink()

    expect((await second.postLink({ token, password: PASSWORD }, undefined, otherCookie)).status).toBe(400)
    expect((await second.postLink({ token, password: PASSWORD })).status).toBe(200)
  })
})

describe('привязка Google к учителю с паролем', () => {
  async function teacherWithPassword() {
    const hasher = await makePasswordHasher()
    return prisma.teacher.create({
      data: { email: EMAIL, passwordHash: await hasher.hash(PASSWORD), displayName: 'Анна Ли', emailVerifiedAt: new Date() },
    })
  }

  it('callback: редирект на /auth/link-google#token=<43>, сессии нет, googleId не меняется, в базе HMAC, срок 10 мин', async () => {
    const teacher = await teacherWithPassword()
    const client = makeClient(verified())
    const before = Date.now()

    const response = await client.get(`/callback?code=qa-code&state=${STATE}`, await client.start())

    const location = response.headers.get('location') ?? ''
    expect(location.startsWith(LINK_PAGE)).toBe(true)
    const token = location.slice(LINK_PAGE.length)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new URL(location).search).toBe('')
    expect(setCookies(response).some((each) => each.startsWith('__Secure-refresh_token='))).toBe(false)
    expectOAuthCookieCleared(response)
    expect((await prisma.teacher.findUnique({ where: { id: teacher.id } }))?.googleId).toBeNull()
    const [row] = await prisma.pendingGoogleLink.findMany()
    expect(row).toMatchObject({ teacherId: teacher.id, googleId: 'google-sub-anna', tokenHash: tokens.hashOpaqueToken(token) })
    expect(Math.abs((row?.expiresAt.getTime() ?? 0) - (before + LINK_TTL_MS))).toBeLessThan(5000)
  })

  it('callback ставит cookie __Secure-google_link: HttpOnly, Secure, SameSite=Strict, Path=/api/auth/google, Max-Age=600, в базе HMAC секрета', async () => {
    await teacherWithPassword()
    const client = makeClient(verified())

    const response = await client.get(`/callback?code=qa-code&state=${STATE}`, await client.start())

    const cookie = setCookies(response).find((each) => each.startsWith('__Secure-google_link='))
    const attributes = (cookie ?? '').split(';').map((part) => part.trim())
    expect(attributes[0]).toMatch(/^__Secure-google_link=[A-Za-z0-9_-]{43}$/)
    expect(attributes).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/auth/google', `Max-Age=${LINK_TTL_MS / 1000}`]))
    const secret = attributes[0]?.split('=')[1] ?? ''
    const [row] = await prisma.pendingGoogleLink.findMany()
    expect(row?.linkSecretHash).toBe(tokens.hashOpaqueToken(secret))
    expect(row?.linkSecretHash).not.toBe(row?.tokenHash)
    expect((response.headers.get('location') ?? '')).not.toContain(secret)
  })

  it('верный пароль: 200 с сессией, googleId записан, запись удалена, одно письмо, токен одноразовый', async () => {
    const teacher = await teacherWithPassword()
    const client = makeClient(verified())
    const token = await client.callbackForLink()

    const response = await client.postLink({ token, password: PASSWORD })
    await flushBackground()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(['accessToken', 'teacher'])
    expect(body.teacher).toMatchObject({ id: teacher.id, hasPassword: true, hasGoogle: true })
    expect(setCookies(response).some((each) => /^__Secure-refresh_token=[A-Za-z0-9_-]{43};/.test(each))).toBe(true)
    expect((await prisma.teacher.findUnique({ where: { id: teacher.id } }))?.googleId).toBe('google-sub-anna')
    expect(await prisma.pendingGoogleLink.count()).toBe(0)
    expect(client.email.sent).toEqual([{ kind: 'googleLinked', to: EMAIL, displayName: 'Анна Ли' }])
    const cleared = setCookies(response).find((each) => each.startsWith('__Secure-google_link='))
    expect(cleared).toContain('Max-Age=0')
    expect(cleared).toContain('Path=/api/auth/google')

    const again = await client.postLink({ token, password: PASSWORD })
    expect(again.status).toBe(400)
    expect(await again.json()).toEqual(WRONG_LOGIN)
  })

  it('после привязки следующий вход через Google — сразу сессия', async () => {
    await teacherWithPassword()
    const client = makeClient(verified())
    await client.postLink({ token: await client.callbackForLink(), password: PASSWORD })

    const response = await client.get(`/callback?code=qa-code&state=${STATE}`, await client.start())

    expect(response.headers.get('location')).toBe(DONE)
  })

  it('неверный токен и неверный пароль — одинаковый 400; при неверном пароле ссылка цела и Google не привязан', async () => {
    await teacherWithPassword()
    const client = makeClient(verified())
    const token = await client.callbackForLink()

    const unknown = await client.postLink({ token: 'A'.repeat(43), password: PASSWORD })
    const wrong = await client.postLink({ token, password: 'qa-wrong-password' })

    for (const response of [unknown, wrong]) {
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual(WRONG_LOGIN)
    }
    expect(await prisma.pendingGoogleLink.count()).toBe(1)
    expect((await prisma.teacher.findUnique({ where: { email: EMAIL } }))?.googleId).toBeNull()
    expect((await client.postLink({ token, password: PASSWORD })).status).toBe(200)
  })

  it(`неверный пароль засчитывается в общий лимит: после ${LOGIN_FAILURES_PER_EMAIL} неудач — 429 и на привязке, и на входе`, async () => {
    await teacherWithPassword()
    const client = makeClient(verified())
    const token = await client.callbackForLink()
    for (let attempt = 0; attempt < LOGIN_FAILURES_PER_EMAIL; attempt++) {
      expect((await client.postLink({ token, password: 'qa-wrong-password' }, `198.51.100.${attempt}`)).status).toBe(400)
    }

    expect((await client.postLink({ token, password: PASSWORD }, '198.51.100.200')).status).toBe(429)
    const login = await client.app.request(
      '/api/auth/login',
      { method: 'POST', headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
      fromIp('198.51.100.201'),
    )
    expect(login.status).toBe(429)
  })

  it('повторный callback заменяет токен: старый — 400, новый работает', async () => {
    await teacherWithPassword()
    const client = makeClient(verified())
    const old = await client.callbackForLink()
    const fresh = await client.callbackForLink()

    expect((await client.postLink({ token: old, password: PASSWORD })).status).toBe(400)
    expect((await client.postLink({ token: fresh, password: PASSWORD })).status).toBe(200)
  })

  it('этот Google-аккаунт успели привязать к другому учителю — 409, без сессии и письма', async () => {
    await teacherWithPassword()
    const client = makeClient(verified())
    const token = await client.callbackForLink()
    await prisma.teacher.create({ data: { email: 'qa-boris@example.test', googleId: 'google-sub-anna', emailVerifiedAt: new Date() } })

    const response = await client.postLink({ token, password: PASSWORD })
    await flushBackground()

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'This Google account cannot be linked to this account' })
    expect(setCookies(response).some((each) => each.startsWith('__Secure-refresh_token='))).toBe(false)
    expect(client.email.sent.filter((sent) => sent.kind === 'googleLinked')).toEqual([])
  })

  it('гонка: два параллельных POST link одним токеном — один 200, другой 400, одно письмо', async () => {
    await teacherWithPassword()
    const client = makeClient(verified())
    const token = await client.callbackForLink()

    const responses = await Promise.all([client.postLink({ token, password: PASSWORD }), client.postLink({ token, password: PASSWORD })])
    await flushBackground()

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400])
    expect(client.email.sent.filter((sent) => sent.kind === 'googleLinked')).toHaveLength(1)
  })

  it('неверное тело — 400 с issues, без введённого пароля', async () => {
    const response = await makeClient(verified()).postLink({ token: 'short', password: '' })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.issues.map((issue: { path: string[] }) => issue.path.join('.')).sort()).toEqual(['password', 'token'])
  })

  it(`${GOOGLE_LINK_PER_IP + 1}-я попытка с одного IP за 15 мин — 429`, async () => {
    const client = makeClient(verified())
    for (let attempt = 0; attempt < GOOGLE_LINK_PER_IP; attempt++) {
      expect((await client.postLink({ token: 'A'.repeat(43), password: PASSWORD }, '192.0.2.50')).status).toBe(400)
    }

    const blocked = await client.postLink({ token: 'A'.repeat(43), password: PASSWORD }, '192.0.2.50')

    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).not.toBeNull()
  })

  it('без настроенного Google маршрута привязки нет — 404', async () => {
    const app = createTestApp({ prisma })

    const response = await app.request('/api/auth/google/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, fromIp())

    expect(response.status).toBe(404)
  })
})

describe('сброс пароля отменяет начатую привязку Google', () => {
  it('ссылка привязки после сброса пароля — 400 и с cookie, и с новым паролем', async () => {
    const hasher = await makePasswordHasher()
    const teacher = await prisma.teacher.create({
      data: { email: EMAIL, passwordHash: await hasher.hash(PASSWORD), displayName: 'Анна Ли', emailVerifiedAt: new Date() },
    })
    const client = makeClient(verified())
    const token = await client.callbackForLink()
    const resetToken = tokens.generateOpaqueToken()
    await prisma.passwordReset.create({ data: { teacherId: teacher.id, tokenHash: tokens.hashOpaqueToken(resetToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } })
    const reset = await client.app.request(
      '/api/auth/reset-password',
      { method: 'POST', headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN }, body: JSON.stringify({ token: resetToken, password: 'qa-brand-new-pass-2026' }) },
      fromIp(),
    )
    expect(reset.status).toBe(204)

    for (const password of [PASSWORD, 'qa-brand-new-pass-2026']) {
      const response = await client.postLink({ token, password })
      expect(response.status).toBe(400)
    }
    expect(await prisma.pendingGoogleLink.count()).toBe(0)
    expect((await prisma.teacher.findUnique({ where: { id: teacher.id } }))?.googleId).toBeNull()
  })
})
