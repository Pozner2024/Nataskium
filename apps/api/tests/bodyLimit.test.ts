import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp as createApp } from './fakes/testApp'

const MAX_BODY_SIZE_BYTES = 100 * 1024
const PAYLOAD_TOO_LARGE_BODY = '{"error":"Payload Too Large"}'
const LOG_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const
const CHUNK_SIZE_BYTES = 16 * 1024

let consoleSpies: ReturnType<typeof spyOnConsole>

function spyOnConsole() {
  return LOG_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
}

function logCallCount() {
  return consoleSpies.reduce((count, spy) => count + spy.mock.calls.length, 0)
}

// JSON ровно из `size` байт в UTF-8: {"pad":"…"}
function jsonOfSize(size: number, filler = 'x') {
  const fillerBytes = Buffer.byteLength(filler)
  const padBytes = size - Buffer.byteLength('{"pad":""}')
  const text = `{"pad":"${filler.repeat(Math.floor(padBytes / fillerBytes))}${'x'.repeat(padBytes % fillerBytes)}"}`

  expect(Buffer.byteLength(text)).toBe(size)
  return text
}

function streamOf(text: string) {
  const bytes = new TextEncoder().encode(text)

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE_BYTES) {
        controller.enqueue(bytes.subarray(offset, offset + CHUNK_SIZE_BYTES))
      }
      controller.close()
    },
  })
}

function createTestApp() {
  const app = createApp()

  app.post('/test', async (c) => c.json({ received: Buffer.byteLength(await c.req.text()) }))

  return app
}

type Transport = 'Content-Length' | 'поток без Content-Length'

function post(text: string, transport: Transport) {
  const app = createTestApp()

  if (transport === 'Content-Length') {
    return app.request('/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) },
      body: text,
    })
  }

  return app.request('/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: streamOf(text),
    duplex: 'half',
  } as RequestInit)
}

beforeEach(() => {
  consoleSpies = spyOnConsole()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each<Transport>(['Content-Length', 'поток без Content-Length'])('bodyLimit: %s', (transport) => {
  it('ровно 100 КБ проходит', async () => {
    const response = await post(jsonOfSize(MAX_BODY_SIZE_BYTES), transport)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: MAX_BODY_SIZE_BYTES })
  })

  it('на байт больше — 413 в нашем формате, с заголовками безопасности, без лога', async () => {
    const response = await post(jsonOfSize(MAX_BODY_SIZE_BYTES + 1), transport)

    expect(response.status).toBe(413)
    expect(response.headers.get('content-type')).toMatch(/^application\/json\b/)
    expect(await response.text()).toBe(PAYLOAD_TOO_LARGE_BODY)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('strict-transport-security')).toMatch(/max-age=[1-9]\d*/)
    expect(logCallCount()).toBe(0)
  })

  it('лимит считается в байтах, а не в символах', async () => {
    const atLimit = await post(jsonOfSize(MAX_BODY_SIZE_BYTES, 'я'), transport)
    const overLimit = await post(jsonOfSize(MAX_BODY_SIZE_BYTES + 1, 'я'), transport)

    expect(atLimit.status).toBe(200)
    expect(overLimit.status).toBe(413)
  })
})

describe('bodyLimit: неизвестный адрес', () => {
  it('большое тело на неизвестный адрес — тоже 413', async () => {
    const response = await createApp().request('/no-such-route', {
      method: 'POST',
      body: streamOf(jsonOfSize(MAX_BODY_SIZE_BYTES + 1)),
      duplex: 'half',
    } as RequestInit)

    expect(response.status).toBe(413)
    expect(await response.text()).toBe(PAYLOAD_TOO_LARGE_BODY)
  })
})
