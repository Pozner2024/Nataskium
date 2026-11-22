import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchingApi } from './matchingApi'
import { newMatching } from './newMatching'

const ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'
const MATCHING = {
  id: ID,
  shareToken: SHARE_TOKEN,
  title: 'T',
  showAnswers: true,
  gradingScale: null,
  introTheme: 'nataskium-night' as const,
  group: 'english',
  timer: { mode: 'none' },
  pairs: [
    { term: 'cat', definition: 'кошка' },
    { term: 'dog', definition: 'собака' },
  ],
}

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
  respondWith({ matching: MATCHING })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('matchingApi', () => {
  it('create шлёт POST /api/matchings с Bearer и телом, разбирает ответ', async () => {
    const input = newMatching()
    const response = await matchingApi.create(input, 'qa-token')

    expect(calls[0]?.url).toBe('/api/matchings')
    expect(calls[0]?.init.method).toBe('POST')
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer qa-token')
    expect(calls[0]?.init.body).toBe(JSON.stringify(input))
    expect(response.matching.pairs).toHaveLength(2)
  })

  it('update шлёт PATCH /api/matchings/<id>', async () => {
    await matchingApi.update(ID, newMatching(), 'qa-token')

    expect(calls[0]?.url).toBe(`/api/matchings/${ID}`)
    expect(calls[0]?.init.method).toBe('PATCH')
  })

  it('get экранирует id в пути', async () => {
    await matchingApi.get('../auth/me', 'qa-token')

    expect(calls[0]?.url).toBe('/api/matchings/..%2Fauth%2Fme')
    expect(calls[0]?.init.method).toBe('GET')
  })

  it('ответ не по схеме — ошибка, а не данные', async () => {
    respondWith({ matching: { ...MATCHING, pairs: 'not-an-array' } })

    await expect(matchingApi.get(ID, 'qa-token')).rejects.toThrow()
  })

  it('remove шлёт DELETE и принимает 204', async () => {
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    await matchingApi.remove(ID, 'qa-token')

    expect(calls[0]?.url).toBe(`/api/matchings/${ID}`)
    expect(calls[0]?.init.method).toBe('DELETE')
  })
})

describe('newMatching', () => {
  it('две пустые пары и пустой раздел', () => {
    const matching = newMatching()

    expect(matching.pairs).toEqual([{ term: '', definition: '' }, { term: '', definition: '' }])
    expect(matching.group).toBe('')
    expect(matching.timer).toEqual({ mode: 'none' })
  })

  it('пары — разные объекты', () => {
    const [first, second] = newMatching().pairs

    expect(first).not.toBe(second)
  })
})
