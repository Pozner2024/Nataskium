import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { flushBackground } from '../fakes/authFakes'
import { makeRecordingEmailSender } from '../fakes/recordingEmailSender'
import { TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTestPrisma, truncateAll } from './testDatabase'

const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const NEW_PASSWORD = 'qa-battery-staple-2031'

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

  const lastOf = (kind: string) => email.sent.filter((each) => each.kind === kind).at(-1)

  async function signUp() {
    await post('/register', { email: EMAIL, password: PASSWORD, displayName: 'Анна' })
    await flushBackground()
    const sent = lastOf('verification')
    const verified = await post('/verify-email', { token: sent?.kind === 'verification' ? sent.rawToken : '', password: PASSWORD })
    const { accessToken } = (await verified.json()) as { accessToken: string }
    email.sent.length = 0
    return { accessToken }
  }

  return { email, post, lastOf, signUp }
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

describe('язык письма в маршрутах авторизации', () => {
  it.each([
    [{ locale: 'en' }, 'en'],
    [{ locale: 'ru' }, 'ru'],
    [{ locale: 'de' }, 'de'],
    [{ locale: 'fr' }, 'fr'],
    [{}, 'ru'],
  ])('регистрация %j: письмо подтверждения на языке «%s»', async (extra, expected) => {
    const client = makeClient()

    const response = await client.post('/register', { email: EMAIL, password: PASSWORD, ...extra })
    await flushBackground()

    expect(response.status).toBe(202)
    expect(client.lastOf('verification')).toMatchObject({ locale: expected })
  })

  it('регистрация существующего адреса: письмо «аккаунт уже есть» на языке запроса', async () => {
    const client = makeClient()
    await client.signUp()

    await client.post('/register', { email: EMAIL, password: PASSWORD, locale: 'en' })
    await flushBackground()

    expect(client.lastOf('accountExists')).toMatchObject({ locale: 'en' })
  })

  it.each(['xx', 'EN', '', 'en-US', 1, null])('регистрация: язык %j — 400 с issues по locale, письма и записи нет', async (locale) => {
    const client = makeClient()

    const response = await client.post('/register', { email: EMAIL, password: PASSWORD, locale })
    await flushBackground()

    expect(response.status).toBe(400)
    expect((await response.json()).issues.map((issue: { path: string[] }) => issue.path.join('.'))).toEqual(['locale'])
    expect(client.email.sent).toEqual([])
    expect(await prisma.pendingRegistration.count()).toBe(0)
  })

  it('запрос сброса: письмо со ссылкой на языке запроса; без языка — по умолчанию', async () => {
    const client = makeClient()
    await client.signUp()

    await client.post('/forgot-password', { email: EMAIL, locale: 'en' })
    await flushBackground()
    expect(client.lastOf('passwordReset')).toMatchObject({ locale: 'en' })

    await client.post('/forgot-password', { email: EMAIL }, {}, '192.0.2.71')
    await flushBackground()
    expect(client.lastOf('passwordReset')).toMatchObject({ locale: 'ru' })
  })

  it('сброс пароля: письмо «пароль изменён» на языке запроса сброса', async () => {
    const client = makeClient()
    await client.signUp()
    await client.post('/forgot-password', { email: EMAIL, locale: 'ru' })
    await flushBackground()
    const reset = client.lastOf('passwordReset')

    const response = await client.post('/reset-password', {
      token: reset?.kind === 'passwordReset' ? reset.rawToken : '',
      password: NEW_PASSWORD,
      locale: 'en',
    })
    await flushBackground()

    expect(response.status).toBe(204)
    expect(client.lastOf('passwordChanged')).toMatchObject({ locale: 'en' })
  })

  it('смена пароля: письмо «пароль изменён» на языке запроса', async () => {
    const client = makeClient()
    const { accessToken } = await client.signUp()

    const response = await client.post(
      '/change-password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, locale: 'en' },
      { authorization: `Bearer ${accessToken}` },
    )
    await flushBackground()

    expect(response.status).toBe(200)
    expect(client.lastOf('passwordChanged')).toMatchObject({ locale: 'en' })
  })

  it('смена пароля: незнакомый язык — 400, пароль прежний', async () => {
    const client = makeClient()
    const { accessToken } = await client.signUp()

    const response = await client.post(
      '/change-password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, locale: 'xx' },
      { authorization: `Bearer ${accessToken}` },
    )

    expect(response.status).toBe(400)
    expect((await client.post('/login', { email: EMAIL, password: PASSWORD })).status).toBe(200)
  })
})
