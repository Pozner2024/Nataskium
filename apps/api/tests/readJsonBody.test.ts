import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApp } from '../src/app'
import { readJsonBody } from '../src/shared/utils'

const LOG_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const
const EMAIL_SECRET = 'secret-mail-123'
const PASSWORD_SECRET = 'secret-pass-123'
const VALID_BODY = { email: 'teacher@example.com', password: PASSWORD_SECRET }

const CONTENT_TYPE_ISSUE = { path: [], message: 'Content-Type must be application/json' }
const INVALID_JSON_ISSUE = { path: [], message: 'Body must be valid JSON' }

const schema = z.object({
  email: z.email({ error: 'Invalid email' }),
  password: z.string({ error: 'Password must be a string' }).min(4, { error: 'Password is too short' }),
})

let consoleSpies: ReturnType<typeof spyOnConsole>

function spyOnConsole() {
  return LOG_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
}

function loggedText() {
  return consoleSpies.flatMap((spy) => spy.mock.calls).flat().map((arg) => inspect(arg)).join('\n')
}

function logCallCount() {
  return consoleSpies.reduce((count, spy) => count + spy.mock.calls.length, 0)
}

function createTestApp() {
  const app = createApp()

  app.post('/test', async (c) => c.json(await readJsonBody(c, schema)))

  return app
}

// null — запрос без Content-Type: undefined включил бы значение по умолчанию
function post(body: BodyInit | undefined, contentType: string | null = 'application/json') {
  if (contentType === null) {
    // Для строки Request сам ставит text/plain: байты отправляются совсем без Content-Type
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
    return createTestApp().request('/test', { method: 'POST', body: bytes })
  }

  return createTestApp().request('/test', { method: 'POST', headers: { 'content-type': contentType }, body })
}

async function expectBadRequest(response: Response, issues: unknown[]) {
  expect(response.status).toBe(400)
  expect(response.headers.get('content-type')).toMatch(/^application\/json\b/)
  expect(await response.json()).toEqual({ error: 'Invalid request', issues })
}

beforeEach(() => {
  consoleSpies = spyOnConsole()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('readJsonBody: корректный запрос', () => {
  it('возвращает разобранные данные', async () => {
    const response = await post(JSON.stringify(VALID_BODY))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(VALID_BODY)
  })

  it('убирает поля, которых нет в схеме', async () => {
    const response = await post(JSON.stringify({ ...VALID_BODY, isAdmin: true }))

    expect(await response.json()).toEqual(VALID_BODY)
  })

  it.each([
    'application/json; charset=utf-8',
    'APPLICATION/JSON',
    'Application/Json;charset=UTF-8',
    'application/json ; charset=utf-8',
  ])('принимает Content-Type %j', async (contentType) => {
    const response = await post(JSON.stringify(VALID_BODY), contentType)

    expect(response.status).toBe(200)
  })
})

describe('readJsonBody: 400', () => {
  it.each([
    ['нет Content-Type', null],
    ['Content-Type без тела типа', ''],
    ['text/plain', 'text/plain'],
    ['форма', 'application/x-www-form-urlencoded'],
    ['multipart', 'multipart/form-data; boundary=x'],
    ['text/json', 'text/json'],
    ['префикс json', 'application/jsonx'],
    ['json после префикса', 'x-application/json'],
    ['json-patch', 'application/json-patch+json'],
    ['vnd+json', 'application/vnd.api+json'],
    ['два типа', 'application/json, text/plain'],
  ])('чужой Content-Type: %s', async (_name, contentType) => {
    const response = await post(JSON.stringify(VALID_BODY), contentType)

    await expectBadRequest(response, [CONTENT_TYPE_ISSUE])
  })

  it.each([
    ['битый JSON', '{"email":'],
    ['пустое тело', ''],
    ['не JSON', 'email=teacher@example.com'],
    ['JSON с хвостом', '{} {}'],
  ])('%s', async (_name, body) => {
    await expectBadRequest(await post(body), [INVALID_JSON_ISSUE])
  })

  it('нет тела', async () => {
    await expectBadRequest(await post(undefined), [INVALID_JSON_ISSUE])
  })

  it.each([
    ['массив', '[]'],
    ['null', 'null'],
    ['число', '42'],
    ['строка', '"teacher@example.com"'],
  ])('%s вместо объекта: ошибка схемы с пустым путём', async (_name, body) => {
    const response = await post(body)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request')
    expect(json.issues).toHaveLength(1)
    expect(json.issues[0].path).toEqual([])
  })

  it('ошибки схемы: путь и сообщение каждого поля', async () => {
    const response = await post(JSON.stringify({ email: 'not-an-email', password: 'abc' }))

    await expectBadRequest(response, [
      { path: ['email'], message: 'Invalid email' },
      { path: ['password'], message: 'Password is too short' },
    ])
  })

  it('отсутствующее поле', async () => {
    const response = await post(JSON.stringify({ email: 'teacher@example.com' }))

    await expectBadRequest(response, [{ path: ['password'], message: 'Password must be a string' }])
  })

  it('в каждой ошибке только path и message', async () => {
    const response = await post(JSON.stringify({ email: 42, password: ['x'] }))
    const { issues } = await response.json()

    for (const issue of issues) {
      expect(Object.keys(issue).sort()).toEqual(['message', 'path'])
    }
  })

  it('есть заголовки безопасности', async () => {
    const response = await post('{')

    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })
})

describe('readJsonBody: значения не утекают', () => {
  it.each([
    ['неверный email, верный пароль', { email: `${EMAIL_SECRET}@`, password: PASSWORD_SECRET }],
    ['короткий пароль', { email: `${EMAIL_SECRET}@`, password: PASSWORD_SECRET.slice(0, 3) }],
    ['пароль не строка', { email: EMAIL_SECRET, password: [PASSWORD_SECRET] }],
  ])('%s: нет в ответе и в логе, 400 не логируется', async (_name, body) => {
    const response = await post(JSON.stringify(body))
    const text = await response.text()

    expect(response.status).toBe(400)
    for (const value of [EMAIL_SECRET, PASSWORD_SECRET, PASSWORD_SECRET.slice(0, 3)]) {
      expect(text).not.toContain(value)
      expect(loggedText()).not.toContain(value)
    }
    expect(logCallCount()).toBe(0)
  })

  it('битый JSON с паролем: значения нет в ответе', async () => {
    const response = await post(`{"password":"${PASSWORD_SECRET}"`)

    expect(await response.text()).not.toContain(PASSWORD_SECRET)
    expect(logCallCount()).toBe(0)
  })

  it('400 не логируется и при разработке', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    await post(JSON.stringify({ email: EMAIL_SECRET, password: PASSWORD_SECRET }))
    await post('{', 'text/plain')

    expect(logCallCount()).toBe(0)
  })
})
