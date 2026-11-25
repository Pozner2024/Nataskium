import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchingPlayApi } from './matchingPlayApi'

const TOKEN = 'abcdefghijklmnopqrstuv'
const SOURCE = { kind: 'share', token: TOKEN } as const
const RESULT = { percent: 50, grade: null, correctCount: 1, partialCount: 0, totalCount: 2 }

type FetchCall = { url: string; init: RequestInit }
let calls: FetchCall[]

function respondWith(body: unknown): void {
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  })
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('matchingPlayApi.finish', () => {
  it('шлёт POST /api/play/<token>/matching/finish без авторизации, null — неотвеченные', async () => {
    respondWith({ result: RESULT })
    const input = { version: 'v1', answers: ['cat', null] }

    const response = await matchingPlayApi.finish(SOURCE, input)

    expect(calls[0]?.url).toBe(`/api/play/${TOKEN}/matching/finish`)
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.body).toBe(JSON.stringify(input))
    expect((calls[0]?.init.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined()
    expect(response).toEqual({ result: RESULT })
  })

  it('review разбирается, если сервер его прислал', async () => {
    const review = [{ correct: true, term: 'cat' }, { correct: false, term: 'dog' }]
    respondWith({ result: RESULT, review })

    const response = await matchingPlayApi.finish(SOURCE, { version: 'v1', answers: ['cat', 'cow'] })

    expect(response.review).toEqual(review)
  })

  it('экранирует токен в пути', async () => {
    respondWith({ result: RESULT })

    await matchingPlayApi.finish({ kind: 'share', token: '../auth' }, { version: 'v1', answers: [] })

    expect(calls[0]?.url).toBe('/api/play/..%2Fauth/matching/finish')
  })

  it('библиотека: POST /api/library/play/<номер>/matching/finish', async () => {
    respondWith({ result: RESULT })

    await matchingPlayApi.finish({ kind: 'library', number: 12 }, { version: 'v1', answers: [] })

    expect(calls[0]?.url).toBe('/api/library/play/12/matching/finish')
    expect(calls[0]?.init.method).toBe('POST')
  })
})
