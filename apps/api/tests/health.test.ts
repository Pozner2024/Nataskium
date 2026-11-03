import { Server } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'

describe('GET /health', () => {
  it('отвечает 200 и только статусом ok', async () => {
    const response = await createApp().request('/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('отвечает JSON', async () => {
    const response = await createApp().request('/health')

    expect(response.headers.get('content-type')).toMatch(/^application\/json\b/)
  })

  it('тело ровно {"status":"ok"}', async () => {
    const response = await createApp().request('/health')

    expect(await response.text()).toBe('{"status":"ok"}')
  })
})

describe('неизвестный адрес', () => {
  it('отвечает 404 без стека и внутренних деталей', async () => {
    const response = await createApp().request('/no-such-route')

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('{"error":"Not Found"}')
  })
})

describe('POST /health', () => {
  it('не отвечает 200', async () => {
    const response = await createApp().request('/health', { method: 'POST' })

    expect(response.status).not.toBe(200)
  })
})

describe('createApp', () => {
  it('маршрут, добавленный в один экземпляр, не появляется в другом', async () => {
    const first = createApp()
    const second = createApp()

    first.get('/only-first', (c) => c.text('first'))

    expect((await first.request('/only-first')).status).toBe(200)
    expect((await second.request('/only-first')).status).toBe(404)
  })

  it('не открывает порт', async () => {
    const listen = vi.spyOn(Server.prototype, 'listen')

    await createApp().request('/health')

    expect(listen).not.toHaveBeenCalled()
    listen.mockRestore()
  })
})
