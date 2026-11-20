import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trueFalsePlayApi } from './trueFalsePlayApi'

const TOKEN = 'abcdefghijklmnopqrstuv'
const RESULT = { percent: 50, grade: null, correctCount: 1, partialCount: 0, totalCount: 2 }

type FetchCall = { url: string; init: RequestInit }
let calls: FetchCall[]

function respondWith(body: unknown): void {
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  })
}

const headers = () => calls[0]?.init.headers as Record<string, string> | undefined

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('trueFalsePlayApi.check', () => {
  it('шлёт POST /api/play/<token>/true-false/check без авторизации', async () => {
    respondWith({ correct: true })
    const input = { version: 'v1', index: 1, answer: false }

    const response = await trueFalsePlayApi.check(TOKEN, input)

    expect(calls[0]?.url).toBe(`/api/play/${TOKEN}/true-false/check`)
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.body).toBe(JSON.stringify(input))
    expect(headers()?.Authorization).toBeUndefined()
    expect(response).toEqual({ correct: true })
  })

  it('экранирует токен в пути', async () => {
    respondWith({ correct: false })

    await trueFalsePlayApi.check('../auth', { version: 'v1', index: 0, answer: true })

    expect(calls[0]?.url).toBe('/api/play/..%2Fauth/true-false/check')
  })

  it('ответ не по схеме — ошибка', async () => {
    respondWith({ correct: 'yes' })

    await expect(trueFalsePlayApi.check(TOKEN, { version: 'v1', index: 0, answer: true })).rejects.toBeInstanceOf(Error)
  })

  it('409 приходит как ApiError со статусом', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ error: 'changed' }), { status: 409 })))

    await expect(trueFalsePlayApi.check(TOKEN, { version: 'v1', index: 0, answer: true })).rejects.toMatchObject({ status: 409 })
  })
})

describe('trueFalsePlayApi.finish', () => {
  it('шлёт POST /api/play/<token>/true-false/finish, null — неотвеченные', async () => {
    respondWith({ result: RESULT })
    const input = { version: 'v1', answers: [true, null] }

    const response = await trueFalsePlayApi.finish(TOKEN, input)

    expect(calls[0]?.url).toBe(`/api/play/${TOKEN}/true-false/finish`)
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.body).toBe(JSON.stringify(input))
    expect(headers()?.Authorization).toBeUndefined()
    expect(response).toEqual({ result: RESULT })
  })

  it('review разбирается, если сервер его прислал', async () => {
    const review = [{ correct: true, answer: true }, { correct: false, answer: false }]
    respondWith({ result: RESULT, review })

    const response = await trueFalsePlayApi.finish(TOKEN, { version: 'v1', answers: [true, true] })

    expect(response.review).toEqual(review)
  })

  it('экранирует токен в пути', async () => {
    respondWith({ result: RESULT })

    await trueFalsePlayApi.finish('../auth', { version: 'v1', answers: [] })

    expect(calls[0]?.url).toBe('/api/play/..%2Fauth/true-false/finish')
  })

  it('ответ не по схеме — ошибка', async () => {
    respondWith({ result: { percent: 'many' } })

    await expect(trueFalsePlayApi.finish(TOKEN, { version: 'v1', answers: [] })).rejects.toBeInstanceOf(Error)
  })
})
