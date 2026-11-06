import { describe, expect, it } from 'vitest'
import { createTestApp as createApp } from './fakes/testApp'

const PATHS = [
  ['/health', 200],
  ['/no-such-route', 404],
] as const

describe.each(PATHS)('заголовки безопасности на %s', (path, status) => {
  it(`отвечает ${status}`, async () => {
    const response = await createApp().request(path)

    expect(response.status).toBe(status)
  })

  it('X-Content-Type-Options: nosniff', async () => {
    const response = await createApp().request(path)

    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('есть X-Frame-Options', async () => {
    const response = await createApp().request(path)

    expect(response.headers.get('x-frame-options')).toBeTruthy()
  })

  it('Strict-Transport-Security с max-age', async () => {
    const response = await createApp().request(path)

    expect(response.headers.get('strict-transport-security')).toMatch(/max-age=[1-9]\d*/)
  })

  it('Referrer-Policy: no-referrer', async () => {
    const response = await createApp().request(path)

    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('нет X-Powered-By', async () => {
    const response = await createApp().request(path)

    expect(response.headers.has('x-powered-by')).toBe(false)
  })
})
