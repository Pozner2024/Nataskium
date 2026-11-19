import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newTrueFalse } from './newTrueFalse'
import { trueFalseApi } from './trueFalseApi'
import type { TrueFalseInput } from './types'

const ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'
const TRUE_FALSE = {
  id: ID,
  shareToken: SHARE_TOKEN,
  title: 'T',
  showAnswers: true,
  gradingScale: null,
  group: 'english',
  timer: { mode: 'none' },
  items: [
    { statement: 'Земля круглая', answer: true },
    { statement: 'Солнце холодное', answer: false },
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
  respondWith({ trueFalse: TRUE_FALSE })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Черновик содержит ответы null, на сервер уходит только готовое задание
function withAnswers(): TrueFalseInput {
  const draft = newTrueFalse()
  return { ...draft, items: draft.items.map((item) => ({ ...item, answer: true })) }
}

describe('trueFalseApi', () => {
  it('create шлёт POST /api/true-false с Bearer и телом, разбирает ответ', async () => {
    const input = withAnswers()
    const response = await trueFalseApi.create(input, 'qa-token')

    expect(calls[0]?.url).toBe('/api/true-false')
    expect(calls[0]?.init.method).toBe('POST')
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer qa-token')
    expect(calls[0]?.init.body).toBe(JSON.stringify(input))
    expect(response.trueFalse.items).toHaveLength(2)
  })

  it('update шлёт PATCH /api/true-false/<id>', async () => {
    await trueFalseApi.update(ID, withAnswers(), 'qa-token')

    expect(calls[0]?.url).toBe(`/api/true-false/${ID}`)
    expect(calls[0]?.init.method).toBe('PATCH')
  })

  it('get экранирует id в пути', async () => {
    await trueFalseApi.get('../auth/me', 'qa-token')

    expect(calls[0]?.url).toBe('/api/true-false/..%2Fauth%2Fme')
    expect(calls[0]?.init.method).toBe('GET')
  })

  it('ответ не по схеме — ошибка, а не данные', async () => {
    respondWith({ trueFalse: { ...TRUE_FALSE, items: 'not-an-array' } })

    await expect(trueFalseApi.get(ID, 'qa-token')).rejects.toThrow()
  })

  it('remove шлёт DELETE и принимает 204', async () => {
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    await trueFalseApi.remove(ID, 'qa-token')

    expect(calls[0]?.url).toBe(`/api/true-false/${ID}`)
    expect(calls[0]?.init.method).toBe('DELETE')
  })
})

describe('newTrueFalse', () => {
  it('два пустых утверждения без ответа, пустой раздел', () => {
    const task = newTrueFalse()

    expect(task.items).toEqual([{ statement: '', answer: null }, { statement: '', answer: null }])
    expect(task.group).toBe('')
    expect(task.showAnswers).toBe(true)
    expect(task.timer).toEqual({ mode: 'none' })
  })

  it('утверждения — разные объекты', () => {
    const [first, second] = newTrueFalse().items

    expect(first).not.toBe(second)
  })
})
