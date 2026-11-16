import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTokenService } from '../src/features/auth'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from './fakes/testApp'

// Без базы: невалидный :id даёт 404 ещё до обращения к БД, поэтому каждый запрос проходит лимит и маршрут
const INVALID_ID_PATH = '/api/quizzes/not-a-uuid'
const READS_PER_TEACHER_PER_MINUTE = 120
const WRITES_PER_TEACHER_PER_MINUTE = 60
const CREATES_PER_TEACHER_PER_DAY = 200
const MS_PER_MINUTE = 60 * 1000
const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })

async function auth(teacherId: string) {
  return { authorization: `Bearer ${await tokens.signAccessToken(teacherId)}` }
}

function call(app: ReturnType<typeof createTestApp>, method: string, headers: Record<string, string>, ip?: string) {
  return app.request(INVALID_ID_PATH, { method, headers: { origin: TEST_WEB_ORIGIN, ...headers } }, fromIp(ip))
}

afterEach(() => {
  vi.useRealTimers()
})

function post(app: ReturnType<typeof createTestApp>, headers: Record<string, string>) {
  return app.request('/api/quizzes', { method: 'POST', headers: { origin: TEST_WEB_ORIGIN, 'content-type': 'application/json', ...headers }, body: '{}' }, fromIp())
}

describe('/api/quizzes: лимиты на учителя', () => {
  it(`чтение: ${READS_PER_TEACHER_PER_MINUTE} в минуту, следующее — 429 с Retry-After; другой учитель не затронут`, async () => {
    const app = createTestApp()
    const headers = await auth(randomUUID())

    for (let i = 0; i < READS_PER_TEACHER_PER_MINUTE; i++) expect((await call(app, 'GET', headers)).status).toBe(404)
    const limited = await call(app, 'GET', headers)
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)

    expect((await call(app, 'GET', await auth(randomUUID()))).status).toBe(404)
  })

  it(`запись: ${WRITES_PER_TEACHER_PER_MINUTE} в минуту на POST/PATCH/DELETE вместе, следующая — 429`, async () => {
    const app = createTestApp()
    const headers = await auth(randomUUID())
    const methods = ['DELETE', 'PATCH']

    for (let i = 0; i < WRITES_PER_TEACHER_PER_MINUTE; i++) {
      expect((await call(app, methods[i % methods.length]!, headers)).status).toBe(404)
    }
    expect((await call(app, 'DELETE', headers)).status).toBe(429)
    expect((await post(app, headers)).status).toBe(429)

    expect((await call(app, 'DELETE', await auth(randomUUID()))).status).toBe(404)
  })

  it('лимит по учителю, а не по IP: смена адреса не сбрасывает счётчик', async () => {
    const app = createTestApp()
    const headers = await auth(randomUUID())

    for (let i = 0; i < WRITES_PER_TEACHER_PER_MINUTE; i++) expect((await call(app, 'DELETE', headers, `10.0.0.${i + 1}`)).status).toBe(404)
    expect((await call(app, 'DELETE', headers, '10.0.1.1')).status).toBe(429)
  })

  it('бюджеты чтения и записи раздельные: исчерпанная запись не мешает читать', async () => {
    const app = createTestApp()
    const headers = await auth(randomUUID())

    for (let i = 0; i < WRITES_PER_TEACHER_PER_MINUTE; i++) await call(app, 'DELETE', headers)
    expect((await call(app, 'DELETE', headers)).status).toBe(429)
    expect((await call(app, 'GET', headers)).status).toBe(404)
  })

  it('без токена — 401, лимит учителя не расходуется', async () => {
    const app = createTestApp()
    for (let i = 0; i <= WRITES_PER_TEACHER_PER_MINUTE; i++) expect((await call(app, 'DELETE', {})).status).toBe(401)
  })

  // Без базы: тело {} не проходит схему (400) до обращения к БД. Минутный лимит записи обходится сдвигом часов
  it(`создание: ${CREATES_PER_TEACHER_PER_DAY} в сутки, следующее — 429 даже при свободном минутном лимите`, async () => {
    vi.useFakeTimers()
    const app = createTestApp()
    const headers = await auth(randomUUID())

    for (let i = 0; i < CREATES_PER_TEACHER_PER_DAY; i++) {
      if (i > 0 && i % WRITES_PER_TEACHER_PER_MINUTE === 0) vi.advanceTimersByTime(MS_PER_MINUTE)
      expect((await post(app, headers)).status).toBe(400)
    }
    vi.advanceTimersByTime(MS_PER_MINUTE)
    const limited = await post(app, headers)
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    // PATCH и DELETE в суточный лимит создания не входят
    expect((await call(app, 'DELETE', headers)).status).toBe(404)
  })
})
