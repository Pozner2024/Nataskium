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
    await playApi.get({ kind: 'share', token: '../auth/me' }).catch(() => undefined)
    await playApi.check({ kind: 'share', token: '../auth/me' }, { version: 'v', questionIndex: 0, selected: [0] }).catch(() => undefined)

    expect(urls).toEqual(['/api/play/..%2Fauth%2Fme', '/api/play/..%2Fauth%2Fme/check'])
  })

  it('библиотека: запросы идут на /api/library/play/<номер>', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url)
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    const source = { kind: 'library', number: 12 } as const
    await playApi.get(source).catch(() => undefined)
    await playApi.check(source, { version: 'v', questionIndex: 0, selected: [0] }).catch(() => undefined)
    await playApi.finish(source, { version: 'v', answers: [[0]] }).catch(() => undefined)

    expect(urls).toEqual(['/api/library/play/12', '/api/library/play/12/check', '/api/library/play/12/finish'])
  })

  const MATCHING_BODY = {
    type: 'matching',
    matching: { title: 'Т', showAnswers: false, version: 'v1', introTheme: 'nataskium-night' as const, timer: { mode: 'none' }, definitions: ['A', 'B'], terms: ['b', 'a'] },
  }

  function stubFetchJson(body: unknown) {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })))
  }

  it('ответ сопоставления разбирается с type matching и без пар', async () => {
    stubFetchJson({ ...MATCHING_BODY, matching: { ...MATCHING_BODY.matching, pairs: [{ term: 'a', definition: 'A' }] } })

    const response = await playApi.get({ kind: 'share', token: 'token' })

    expect(response.type).toBe('matching')
    if (response.type !== 'matching') throw new Error('expected matching')
    expect(response.matching).not.toHaveProperty('pairs')
    expect(response.matching.definitions).toEqual(['A', 'B'])
  })

  it('неизвестный type в ответе — ошибка, а не данные', async () => {
    stubFetchJson({ type: 'poll', poll: {} })

    await expect(playApi.get({ kind: 'share', token: 'token' })).rejects.toThrow()
  })
})
