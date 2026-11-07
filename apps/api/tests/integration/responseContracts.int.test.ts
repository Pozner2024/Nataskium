import {
  apiErrorResponseSchema,
  authSessionResponseSchema,
  meResponseSchema,
  messageResponseSchema,
} from '@nataskium/shared/schemas'
import type { ZodType } from 'zod'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { flushBackground } from '../fakes/authFakes'
import { makeRecordingEmailSender } from '../fakes/recordingEmailSender'
import { TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTestPrisma, truncateAll } from './testDatabase'

// Контракт фронтенда и API: настоящие ответы createApp разбираются схемами из packages/shared без ошибок
// и без потери полей. Если API начнёт отдавать другое, фронтенд не сможет разобрать ответ — тест упадёт здесь
const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'

let prisma: PrismaClient

function makeClient() {
  const email = makeRecordingEmailSender()
  const app = createTestApp({ prisma, emailSender: email.sender })
  const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(
      `/api/auth${path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      fromIp(),
    )

  async function signUp() {
    await post('/register', { email: EMAIL, password: PASSWORD, displayName: 'Анна' })
    await flushBackground()
    const sent = email.sent.find((each) => each.kind === 'verification')
    return post('/verify-email', { token: sent?.kind === 'verification' ? sent.rawToken : '', password: PASSWORD })
  }

  return { app, post, signUp }
}

// Разбор без потерь: схема принимает тело и возвращает его целиком, лишних полей в ответе нет
async function expectExactContract(response: Response, schema: ZodType, status: number) {
  expect(response.status).toBe(status)
  const body: unknown = await response.json()
  const parsed = schema.safeParse(body)
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  expect(parsed.data).toEqual(body)
  return body
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('успешные ответы', () => {
  it('202 register — messageResponseSchema', async () => {
    await expectExactContract(await makeClient().post('/register', { email: EMAIL, password: PASSWORD }), messageResponseSchema, 202)
  })

  it('202 forgot-password — messageResponseSchema', async () => {
    await expectExactContract(await makeClient().post('/forgot-password', { email: EMAIL }), messageResponseSchema, 202)
  })

  it('200 verify-email, login и refresh — authSessionResponseSchema', async () => {
    const client = makeClient()
    const verified = await client.signUp()
    const cookie = (verified.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    await expectExactContract(verified, authSessionResponseSchema, 200)

    await expectExactContract(await client.post('/login', { email: EMAIL, password: PASSWORD }), authSessionResponseSchema, 200)
    await expectExactContract(await client.post('/refresh', undefined, { cookie }), authSessionResponseSchema, 200)
  })

  it('200 me — meResponseSchema', async () => {
    const client = makeClient()
    const { accessToken } = (await (await client.signUp()).json()) as { accessToken: string }

    const response = await client.app.request('/api/auth/me', { headers: { authorization: `Bearer ${accessToken}` } }, fromIp())

    await expectExactContract(response, meResponseSchema, 200)
  })
})

describe('ошибки — apiErrorResponseSchema', () => {
  it('400 валидации — error и issues с путями-строками', async () => {
    const body = await expectExactContract(
      await makeClient().post('/register', { email: 'not-an-email', password: '1', displayName: '' }),
      apiErrorResponseSchema,
      400,
    )

    expect((body as { issues: unknown[] }).issues.length).toBeGreaterThan(0)
  })

  it('400 неверного JSON', async () => {
    const client = makeClient()
    const response = await client.app.request(
      '/api/auth/login',
      { method: 'POST', headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN }, body: '{not json' },
      fromIp(),
    )

    expect(response.status).toBe(400)
    expect(apiErrorResponseSchema.safeParse(await response.json()).success).toBe(true)
  })

  it.each([
    ['401 login', (client: ReturnType<typeof makeClient>) => client.post('/login', { email: EMAIL, password: 'qa-wrong' }), 401],
    ['401 refresh без cookie', (client: ReturnType<typeof makeClient>) => client.post('/refresh'), 401],
    ['401 me без токена', (client: ReturnType<typeof makeClient>) => client.app.request('/api/auth/me', {}, fromIp()), 401],
    ['403 refresh без Origin', (client: ReturnType<typeof makeClient>) => client.app.request('/api/auth/refresh', { method: 'POST' }, fromIp()), 403],
    ['404 неизвестный маршрут', (client: ReturnType<typeof makeClient>) => client.app.request('/api/auth/no-such-route', {}, fromIp()), 404],
  ])('%s', async (_name, request, status) => {
    await expectExactContract(await request(makeClient()), apiErrorResponseSchema, status)
  })

  it('429 — тоже apiErrorResponseSchema', async () => {
    const client = makeClient()
    let last: Response | undefined
    for (let attempt = 0; attempt < 61; attempt++) last = await client.post('/refresh')

    if (last === undefined) throw new Error('no response')
    await expectExactContract(last, apiErrorResponseSchema, 429)
  })
})
