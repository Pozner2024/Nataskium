import { describe, expect, it } from 'vitest'
import { createTestApp, fromIp } from './fakes/testApp'

const ME_PATH = '/api/auth/me'
const LIMIT = 2
const WINDOW_MS = 60_000

describe('GET /api/auth/me: лимит по IP', () => {
  it('после исчерпания лимита — 429 с Retry-After, до этого запрос доходит до проверки токена (401)', async () => {
    const app = createTestApp({ limits: { mePerIp: { max: LIMIT, windowMs: WINDOW_MS } } })

    for (let attempt = 0; attempt < LIMIT; attempt++) {
      expect((await app.request(ME_PATH, {}, fromIp())).status).toBe(401)
    }
    const limited = await app.request(ME_PATH, {}, fromIp())

    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
  })
})
