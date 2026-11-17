import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { type LibraryQuizResponse, libraryApi } from '@/entities/library'
import { ApiError } from '@/shared'
import { useLibraryQuiz } from './useLibraryQuiz'

const FIRST_NUMBER = 12
const SECOND_NUMBER = 13
const NOT_FOUND_STATUS = 404
const RATE_LIMIT_STATUS = 429
const NETWORK_STATUS = 0

function quizBody(number: number, title: string): LibraryQuizResponse {
  return {
    quiz: {
      type: 'quiz' as const,
      number,
      title,
      groupSlug: 'other',
      questionCount: 1,
      graded: false,
      createdAt: '2026-11-15T10:00:00.000Z',
      questions: [{ text: 'Вопрос', imageUrl: null, options: [{ text: 'Ответ', imageUrl: null }] }],
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useLibraryQuiz', () => {
  it('сначала loading, после ответа ready с карточкой', async () => {
    vi.spyOn(libraryApi, 'get').mockResolvedValue(quizBody(FIRST_NUMBER, 'Столицы'))
    const { quiz, status, load } = useLibraryQuiz(ref(FIRST_NUMBER))
    expect(status.value).toBe('loading')

    await load()

    expect(libraryApi.get).toHaveBeenCalledWith(FIRST_NUMBER)
    expect(status.value).toBe('ready')
    expect(quiz.value?.title).toBe('Столицы')
  })

  it('404 даёт notFound и убирает карточку', async () => {
    vi.spyOn(libraryApi, 'get').mockRejectedValue(new ApiError(NOT_FOUND_STATUS))
    const { quiz, status, load } = useLibraryQuiz(ref(FIRST_NUMBER))

    await load()

    expect(status.value).toBe('notFound')
    expect(quiz.value).toBeNull()
  })

  it.each([RATE_LIMIT_STATUS, NETWORK_STATUS, 500])('статус %i даёт error, а не notFound', async (code) => {
    vi.spyOn(libraryApi, 'get').mockRejectedValue(new ApiError(code))
    const { status, load } = useLibraryQuiz(ref(FIRST_NUMBER))

    await load()

    expect(status.value).toBe('error')
  })

  it('не ApiError (например, ответ не по схеме) тоже даёт error', async () => {
    vi.spyOn(libraryApi, 'get').mockRejectedValue(new Error('boom'))
    const { status, load } = useLibraryQuiz(ref(FIRST_NUMBER))

    await load()

    expect(status.value).toBe('error')
  })

  it('повтор после ошибки загружает заново', async () => {
    const get = vi.spyOn(libraryApi, 'get')
    get.mockRejectedValueOnce(new ApiError(RATE_LIMIT_STATUS)).mockResolvedValueOnce(quizBody(FIRST_NUMBER, 'Столицы'))
    const { status, load } = useLibraryQuiz(ref(FIRST_NUMBER))

    await load()
    expect(status.value).toBe('error')
    await load()

    expect(status.value).toBe('ready')
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('ответ на устаревший запрос не затирает свежий', async () => {
    let resolveFirst: (value: LibraryQuizResponse) => void = () => undefined
    const get = vi.spyOn(libraryApi, 'get')
    get.mockImplementationOnce(() => new Promise<LibraryQuizResponse>((resolve) => (resolveFirst = resolve)))
    get.mockResolvedValueOnce(quizBody(SECOND_NUMBER, 'Новое'))
    const number = ref(FIRST_NUMBER)
    const { quiz, status, load } = useLibraryQuiz(number)

    const first = load()
    number.value = SECOND_NUMBER
    await load()
    resolveFirst(quizBody(FIRST_NUMBER, 'Старое'))
    await first

    expect(status.value).toBe('ready')
    expect(quiz.value?.title).toBe('Новое')
  })
})
