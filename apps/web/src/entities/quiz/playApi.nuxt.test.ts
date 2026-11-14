import { afterEach, describe, expect, it, vi } from 'vitest'
import { playApi } from './playApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('playApi', () => {
  it('экранирует токен в пути', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url)
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    await playApi.get('../auth/me').catch(() => undefined)
    await playApi.check('../auth/me', { version: 'v', questionIndex: 0, selected: [0] }).catch(() => undefined)

    expect(urls).toEqual(['/api/play/..%2Fauth%2Fme', '/api/play/..%2Fauth%2Fme/check'])
  })
})
