import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTokenService } from '../src/features/auth'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from './fakes/testApp'

const KB = 1024
const MB = 1024 * KB
const PAYLOAD_TOO_LARGE_BODY = '{"error":"Payload Too Large"}'
const CHUNK_SIZE_BYTES = 64 * KB
const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })

type Transport = 'Content-Length' | 'поток'

// JSON ровно из `size` байт: {"pad":"…"} — схеме викторины не соответствует, поэтому без превышения лимита — 400
function jsonOfSize(size: number): string {
  return `{"pad":"${'x'.repeat(size - Buffer.byteLength('{"pad":""}'))}"}`
}

function streamOf(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE_BYTES) {
        controller.enqueue(bytes.subarray(offset, offset + CHUNK_SIZE_BYTES))
      }
      controller.close()
    },
  })
}

async function send(method: string, path: string, body: Uint8Array, contentType: string, transport: Transport) {
  const headers: Record<string, string> = {
    origin: TEST_WEB_ORIGIN,
    'content-type': contentType,
    authorization: `Bearer ${await tokens.signAccessToken(randomUUID())}`,
  }
  if (transport === 'Content-Length') headers['content-length'] = String(body.byteLength)
  const init = transport === 'Content-Length' ? { method, headers, body } : { method, headers, body: streamOf(body), duplex: 'half' }
  return createTestApp().request(path, init as RequestInit, fromIp())
}

function sendJson(method: string, path: string, size: number, transport: Transport) {
  return send(method, path, new TextEncoder().encode(jsonOfSize(size)), 'application/json', transport)
}

beforeEach(() => {
  for (const method of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe.each<Transport>(['Content-Length', 'поток'])('лимиты тела по путям: %s', (transport) => {
  it.each([
    ['POST', '/api/quizzes'],
    ['PATCH', `/api/quizzes/${randomUUID()}`],
  ])('%s %s: 150 КБ доходит до проверки схемы (400), 170 КБ — 413', async (method, path) => {
    const accepted = await sendJson(method, path, 150 * KB, transport)
    const rejected = await sendJson(method, path, 170 * KB, transport)

    expect(accepted.status).toBe(400)
    expect(rejected.status).toBe(413)
    expect(await rejected.text()).toBe(PAYLOAD_TOO_LARGE_BODY)
  })

  it('/api/auth/login: по-прежнему 100 КБ', async () => {
    const rejected = await sendJson('POST', '/api/auth/login', 100 * KB + 1, transport)

    expect(rejected.status).toBe(413)
  })

  it('похожий путь /api/quizzes-x не получает лимит викторин', async () => {
    expect((await sendJson('POST', '/api/quizzes-x', 150 * KB, transport)).status).toBe(413)
  })

  it('/api/quiz-images: больше 16 МБ — 413', async () => {
    const response = await send('POST', '/api/quiz-images', new Uint8Array(16 * MB + 1), 'multipart/form-data; boundary=x', transport)

    expect(response.status).toBe(413)
    expect(await response.text()).toBe(PAYLOAD_TOO_LARGE_BODY)
  })

  it('16 МБ разрешены только для POST /api/quiz-images, не для /api/quizzes', async () => {
    expect((await sendJson('POST', '/api/quizzes', 1 * MB, transport)).status).toBe(413)
  })
})
