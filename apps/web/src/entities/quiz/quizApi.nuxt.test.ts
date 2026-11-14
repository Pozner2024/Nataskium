import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newQuiz } from './newQuestion'
import { quizApi } from './quizApi'

const ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SHARE_TOKEN = 'abcdefghijklmnopqrstuv'

type FetchCall = { url: string; init: RequestInit }
let calls: FetchCall[]

beforeEach(() => {
  calls = []
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const quiz = {
      id: ID,
      shareToken: SHARE_TOKEN,
      title: 'T',
      showAnswers: true,
      gradingScale: null,
      questions: [{
        text: 'Q',
        imageId: null,
        imageUrl: null,
        options: [
          { text: 'a', isCorrect: true, imageId: null, imageUrl: null },
          { text: 'b', isCorrect: false, imageId: null, imageUrl: null },
        ],
      }],
    }
    return Promise.resolve(new Response(JSON.stringify({ quiz }), { status: 200 }))
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('quizApi', () => {
  it('update шлёт PATCH /api/quizzes/<id> с Bearer и телом', async () => {
    const input = newQuiz()
    await quizApi.update(ID, input, 'qa-token')

    expect(calls[0]?.url).toBe(`/api/quizzes/${ID}`)
    expect(calls[0]?.init.method).toBe('PATCH')
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer qa-token')
    expect(calls[0]?.init.body).toBe(JSON.stringify(input))
  })

  it('get экранирует id в пути', async () => {
    await quizApi.get('../auth/me', 'qa-token')

    expect(calls[0]?.url).toBe('/api/quizzes/..%2Fauth%2Fme')
  })

  it('remove шлёт DELETE и принимает 204', async () => {
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    await quizApi.remove(ID, 'qa-token')

    expect(calls[0]?.url).toBe(`/api/quizzes/${ID}`)
    expect(calls[0]?.init.method).toBe('DELETE')
  })
})
