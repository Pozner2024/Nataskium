import { inspect } from 'node:util'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { flushBackground } from '../fakes/authFakes'
import { makeRecordingEmailSender } from '../fakes/recordingEmailSender'
import { TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTestPrisma, truncateAll } from './testDatabase'

const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const NEW_PASSWORD = 'qa-new-staple-battery-2026'
const RESET_REQUESTED = { message: 'If an account with a password exists for this email, we sent a reset link' }
const INVALID_RESET = { error: 'The reset link is invalid or expired, request a new one' }
const MS_PER_HOUR = 60 * 60 * 1000
const RESET_EMAILS_PER_HOUR = 3
const RESET_EMAILS_PER_DAY = 5
const FORGOT_PASSWORD_PER_IP = 30
const RESET_PASSWORD_PER_IP = 30

let prisma: PrismaClient

function makeClient(options: { failWith?: Error } = {}) {
  const email = makeRecordingEmailSender(options)
  const app = createTestApp({ prisma, emailSender: email.sender })

  function post(path: string, body: unknown, ip?: string, headers: Record<string, string> = {}) {
    return app.request(
      `/api/auth${path}`,
      { method: 'POST', headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN, ...headers }, body: JSON.stringify(body) },
      fromIp(ip),
    )
  }

  function lastToken(kind: 'verification' | 'passwordReset'): string {
    const sent = email.sent.filter((each) => each.kind === kind).at(-1)
    if (sent === undefined || !('rawToken' in sent)) throw new Error(`no ${kind} email`)
    return sent.rawToken
  }

  async function signUp(address = EMAIL) {
    await post('/register', { email: address, password: PASSWORD, displayName: 'Анна' })
    await flushBackground()
    return post('/verify-email', { token: lastToken('verification'), password: PASSWORD })
  }

  async function requestReset(address = EMAIL, ip?: string) {
    const response = await post('/forgot-password', { email: address }, ip)
    await flushBackground()
    return response
  }

  function resetEmails() {
    return email.sent.filter((each) => each.kind === 'passwordReset')
  }

  return { app, email, post, lastToken, signUp, requestReset, resetEmails }
}

function cookieOf(response: Response): string {
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('POST /api/auth/forgot-password', () => {
  it('202 с одним и тем же ответом для учителя, незнакомого адреса и входа только через Google', async () => {
    const client = makeClient()
    await client.signUp()
    await prisma.teacher.create({ data: { email: 'qa-google@example.test', googleId: 'google-sub-1', emailVerifiedAt: new Date() } })

    const responses = [
      await client.requestReset(' QA-Anna@Example.TEST '),
      await client.requestReset('qa-nobody@example.test'),
      await client.requestReset('qa-google@example.test'),
    ]

    for (const response of responses) {
      expect(response.status).toBe(202)
      expect(await response.json()).toEqual(RESET_REQUESTED)
    }
    expect(client.resetEmails()).toEqual([{ kind: 'passwordReset', to: EMAIL, rawToken: expect.any(String), displayName: 'Анна' }])
    expect(await prisma.passwordReset.count()).toBe(1)
  })

  it('неверный email — 400', async () => {
    const response = await makeClient().post('/forgot-password', { email: 'not-an-email' })

    expect(response.status).toBe(400)
  })

  it(`${FORGOT_PASSWORD_PER_IP + 1}-й запрос с одного IP за час — 429 с Retry-After`, async () => {
    const client = makeClient()
    for (let attempt = 0; attempt < FORGOT_PASSWORD_PER_IP; attempt++) {
      expect((await client.post('/forgot-password', { email: `qa-${attempt}@example.test` }, '192.0.2.30')).status).toBe(202)
    }

    const blocked = await client.post('/forgot-password', { email: 'qa-last@example.test' }, '192.0.2.30')

    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).not.toBeNull()
    expect((await client.post('/forgot-password', { email: 'qa-last@example.test' }, '192.0.2.31')).status).toBe(202)
  })

  it(`бюджет писем сброса: ${RESET_EMAILS_PER_HOUR} в час и ${RESET_EMAILS_PER_DAY} в сутки, ответ при этом не меняется`, async () => {
    const client = makeClient()
    await client.signUp()
    const start = Date.now() + MS_PER_HOUR
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(start)

    for (let attempt = 0; attempt < RESET_EMAILS_PER_HOUR + 2; attempt++) {
      expect((await client.requestReset(EMAIL, `198.51.100.${attempt}`)).status).toBe(202)
    }
    expect(client.resetEmails()).toHaveLength(RESET_EMAILS_PER_HOUR)

    vi.setSystemTime(start + MS_PER_HOUR + 1000)
    for (let attempt = 0; attempt < RESET_EMAILS_PER_HOUR; attempt++) await client.requestReset(EMAIL, `198.51.100.${50 + attempt}`)
    expect(client.resetEmails()).toHaveLength(RESET_EMAILS_PER_DAY)

    vi.setSystemTime(start + 3 * MS_PER_HOUR)
    await client.requestReset(EMAIL, '198.51.100.99')
    expect(client.resetEmails()).toHaveLength(RESET_EMAILS_PER_DAY)
  })

  it('бюджет сброса отдельный от бюджета регистрации', async () => {
    const client = makeClient()
    await client.signUp()
    // Бюджет писем регистрации на этот адрес исчерпан повторными регистрациями
    for (let attempt = 0; attempt < 6; attempt++) await client.post('/register', { email: EMAIL, password: PASSWORD }, `203.0.113.${attempt}`)

    await client.requestReset()

    expect(client.resetEmails()).toHaveLength(1)
  })
})

describe('POST /api/auth/reset-password', () => {
  it('204: cookie стирается, сессии закрыты, новый пароль работает, старый нет, сессия не выдаётся', async () => {
    const client = makeClient()
    const session = cookieOf(await client.signUp())
    const otherDevice = cookieOf(await client.post('/login', { email: EMAIL, password: PASSWORD }))
    await client.requestReset()

    const response = await client.post('/reset-password', { token: client.lastToken('passwordReset'), password: NEW_PASSWORD })

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('set-cookie')).toMatch(/^__Secure-refresh_token=;.*Max-Age=0/)
    for (const cookie of [session, otherDevice]) {
      const refresh = await client.app.request('/api/auth/refresh', { method: 'POST', headers: { cookie, origin: TEST_WEB_ORIGIN } }, fromIp())
      expect(refresh.status).toBe(401)
    }
    expect((await client.post('/login', { email: EMAIL, password: PASSWORD })).status).toBe(401)
    expect((await client.post('/login', { email: EMAIL, password: NEW_PASSWORD })).status).toBe(200)
  })

  it('после сброса — письмо «пароль изменён» на адрес учителя, ровно одно и при гонке', async () => {
    const client = makeClient()
    await client.signUp()
    await client.requestReset()
    const token = client.lastToken('passwordReset')

    await Promise.all([
      client.post('/reset-password', { token, password: NEW_PASSWORD }),
      client.post('/reset-password', { token, password: 'qa-other-strong-pass-88' }),
    ])
    await flushBackground()

    expect(client.email.sent.filter((each) => each.kind === 'passwordChanged')).toEqual([
      { kind: 'passwordChanged', to: EMAIL, displayName: 'Анна' },
    ])
  })

  // Письмо записывается фейком до сбоя: токен для сценария есть, а каждая отправка падает
  it('сбой почты не меняет 204, в логе нет адреса', async () => {
    const logged: unknown[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args)
    })
    const client = makeClient({ failWith: new Error(`Resend rejected ${EMAIL}`) })
    await client.signUp()
    await client.requestReset()

    const response = await client.post('/reset-password', { token: client.lastToken('passwordReset'), password: NEW_PASSWORD })
    await flushBackground()

    expect(response.status).toBe(204)
    expect(client.email.sent.filter((each) => each.kind === 'passwordChanged')).toHaveLength(1)
    expect((await client.post('/login', { email: EMAIL, password: NEW_PASSWORD })).status).toBe(200)
    const text = inspect(logged, { depth: null })
    expect(text).toContain('passwordReset.changed')
    expect(text).not.toContain(EMAIL)
  })

  it('неудачный сброс — письма «пароль изменён» нет', async () => {
    const client = makeClient()
    await client.post('/reset-password', { token: 'A'.repeat(43), password: NEW_PASSWORD })
    await flushBackground()

    expect(client.email.sent.filter((each) => each.kind === 'passwordChanged')).toEqual([])
  })

  it('ссылка одноразовая: повтор — 400', async () => {
    const client = makeClient()
    await client.signUp()
    await client.requestReset()
    const token = client.lastToken('passwordReset')
    await client.post('/reset-password', { token, password: NEW_PASSWORD })

    const again = await client.post('/reset-password', { token, password: 'qa-third-strong-pass-77' })

    expect(again.status).toBe(400)
    expect(await again.json()).toEqual(INVALID_RESET)
  })

  it('старая ссылка после нового запроса — 400, новая работает', async () => {
    const client = makeClient()
    await client.signUp()
    await client.requestReset()
    const old = client.lastToken('passwordReset')
    await client.requestReset()

    expect((await client.post('/reset-password', { token: old, password: NEW_PASSWORD })).status).toBe(400)
    expect((await client.post('/reset-password', { token: client.lastToken('passwordReset'), password: NEW_PASSWORD })).status).toBe(204)
  })

  it('неизвестная и истёкшая ссылка — тот же 400', async () => {
    const client = makeClient()
    await client.signUp()
    await client.requestReset()
    const token = client.lastToken('passwordReset')
    await prisma.passwordReset.updateMany({ data: { createdAt: new Date(Date.now() - 3 * MS_PER_HOUR), expiresAt: new Date(Date.now() - MS_PER_HOUR) } })

    const expired = await client.post('/reset-password', { token, password: NEW_PASSWORD })
    const unknown = await client.post('/reset-password', { token: 'A'.repeat(43), password: NEW_PASSWORD })

    expect(expired.status).toBe(400)
    expect(await expired.json()).toEqual(INVALID_RESET)
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toEqual(INVALID_RESET)
  })

  it.each([
    ['популярный', 'qwerty'],
    ['короткий', 'abc'],
    ['последовательность', '12345678'],
  ])('новый пароль по правилам регистрации: %s — 400, пароль не меняется, ссылка цела', async (_name, password) => {
    const client = makeClient()
    await client.signUp()
    await client.requestReset()
    const token = client.lastToken('passwordReset')

    const response = await client.post('/reset-password', { token, password })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.issues.map((issue: { path: string[] }) => issue.path.join('.'))).toEqual(['password'])
    expect(JSON.stringify(body)).not.toContain(password)
    expect((await client.post('/reset-password', { token, password: NEW_PASSWORD })).status).toBe(204)
  })

  it('гонка: два сброса одной ссылкой — один 204, другой 400', async () => {
    const client = makeClient()
    await client.signUp()
    await client.requestReset()
    const token = client.lastToken('passwordReset')

    const responses = await Promise.all([
      client.post('/reset-password', { token, password: NEW_PASSWORD }),
      client.post('/reset-password', { token, password: 'qa-other-strong-pass-88' }),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([204, 400])
  })

  it(`${RESET_PASSWORD_PER_IP + 1}-я попытка с одного IP — 429`, async () => {
    const client = makeClient()
    for (let attempt = 0; attempt < RESET_PASSWORD_PER_IP; attempt++) {
      expect((await client.post('/reset-password', { token: 'A'.repeat(43), password: NEW_PASSWORD }, '192.0.2.40')).status).toBe(400)
    }

    expect((await client.post('/reset-password', { token: 'A'.repeat(43), password: NEW_PASSWORD }, '192.0.2.40')).status).toBe(429)
  })
})
