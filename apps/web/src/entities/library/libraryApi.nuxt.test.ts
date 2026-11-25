import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared'
import { libraryApi } from './libraryApi'

const QUIZ_NUMBER = 12
const QUIZ_ID = '0b6a9c1e-7f3d-4a52-9e1b-3c5d7f9a1b2c'

type FetchCall = { url: string; init: RequestInit }

function stubFetch(response: Response): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(response)
  })
  return calls
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('libraryApi.take', () => {
  it('отправляет POST с токеном учителя и без тела, возвращает id копии', async () => {
    const calls = stubFetch(json({ quizId: QUIZ_ID, type: 'quiz' }, 201))

    const response = await libraryApi.take(QUIZ_NUMBER, 'access-1')

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`/api/library/${QUIZ_NUMBER}/take`)
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer access-1' })
    expect(calls[0]?.init.body).toBeUndefined()
    expect(response).toEqual({ quizId: QUIZ_ID, type: 'quiz' })
  })

  it('ждёт ответа 60 секунд: копирование картинок идёт дольше обычного запроса', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    stubFetch(json({ quizId: QUIZ_ID, type: 'quiz' }, 201))

    await libraryApi.take(QUIZ_NUMBER, 'access-1')

    expect(timeout).toHaveBeenCalledWith(60_000)
  })

  it.each([401, 404, 409, 429, 503])('статус %i даёт ApiError с этим статусом', async (status) => {
    stubFetch(json({ error: 'x' }, status))

    const error = await libraryApi.take(QUIZ_NUMBER, 'access-1').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(status)
  })
})
