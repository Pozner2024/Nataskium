import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { ApiError } from '@/shared'
import { usePlayStore } from './store'

vi.mock('@/entities/quiz', () => ({
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const get = vi.mocked(playApi.get)
const check = vi.mocked(playApi.check)
const finish = vi.mocked(playApi.finish)

const RESULT = { percent: 100, grade: '5', correctCount: 2, partialCount: 0, totalCount: 2 }
const TOKEN = 'abcdefghijklmnopqrstuv'
const NO_SHUFFLE = () => 0.99

function quiz(showAnswers: boolean) {
  return {
    quiz: {
      title: 'Столицы',
      showAnswers,
      version: 'v1',
      questions: [
        { text: 'Q1', options: ['a', 'b', 'c'], selectCount: 2 },
        { text: 'Q2', options: ['d', 'e'], selectCount: 1 },
      ],
    },
  }
}

let store: ReturnType<typeof usePlayStore>

beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  store = usePlayStore()
})

describe('usePlayStore', () => {
  it('невалидный токен: «не найдено» без запроса', async () => {
    await store.start('../auth/me')
    expect(store.status).toBe('notFound')
    expect(get).not.toHaveBeenCalled()
  })

  it('3-я отметка при selectCount = 2 не добавляется, снять отметку можно', async () => {
    get.mockResolvedValue(quiz(false))
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    store.toggle(2)
    expect(store.selected).toEqual([0, 1])
    expect(store.isDisabled(2)).toBe(true)
    expect(store.isDisabled(1)).toBe(false)
    store.toggle(1)
    expect(store.selected).toEqual([0])
    expect(store.canSubmit).toBe(false)
  })

  it('без showAnswers после «Ответить» сразу следующий вопрос, check не вызывается', async () => {
    get.mockResolvedValue(quiz(false))
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    expect(check).not.toHaveBeenCalled()
    expect(store.current).toBe(1)
    expect(store.selected).toEqual([])
    expect(store.phase).toBe('question')
  })

  it('с showAnswers после «Ответить» — проверка и подсветка, «Дальше» ведёт к итогу', async () => {
    get.mockResolvedValue(quiz(true))
    check.mockResolvedValue({ correct: [0, 2] })
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    expect(check).toHaveBeenCalledWith(TOKEN, { version: 'v1', questionIndex: 0, selected: [0, 1] })
    expect(store.phase).toBe('feedback')
    expect(store.correct).toEqual([0, 2])

    await store.next()
    store.toggle(1)
    check.mockResolvedValue({ correct: [1] })
    await store.submit()
    await store.next()
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [[0, 1], [1]] })
    expect(store.phase).toBe('result')
    expect(store.result).toEqual(RESULT)
  })

  it('варианты уходят на сервер с исходными индексами', async () => {
    get.mockResolvedValue(quiz(false))
    await store.start(TOKEN, () => 0)
    const first = store.question!.options
    expect(first.map((option) => option.index)).toEqual([1, 2, 0])
    store.toggle(first[0]!.index)
    store.toggle(first[1]!.index)
    expect(store.selected).toEqual([1, 2])
  })

  it('404 — notFound, 409 — changed', async () => {
    get.mockRejectedValue(new ApiError(404))
    await store.start(TOKEN)
    expect(store.status).toBe('notFound')

    get.mockResolvedValue(quiz(false))
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    store.toggle(0)
    finish.mockRejectedValue(new ApiError(409))
    await store.submit()
    expect(store.status).toBe('changed')
  })

  it('сбой сети — failed, retry повторяет тот же запрос', async () => {
    get.mockResolvedValue(quiz(true))
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    check.mockRejectedValueOnce(new ApiError(0)).mockResolvedValueOnce({ correct: [0, 1] })
    await store.submit()
    expect(store.status).toBe('failed')
    await store.retry()
    expect(store.status).toBe('ready')
    expect(store.phase).toBe('feedback')
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('сбой загрузки — retry загружает заново', async () => {
    get.mockRejectedValueOnce(new ApiError(429)).mockResolvedValueOnce(quiz(false))
    await store.start(TOKEN)
    expect(store.status).toBe('failed')
    await store.retry()
    expect(store.status).toBe('ready')
    expect(store.questions).toHaveLength(2)
  })

  it('start сбрасывает прохождение', async () => {
    get.mockResolvedValue(quiz(false))
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    store.toggle(0)
    await store.submit()
    expect(store.phase).toBe('result')
    await store.start()
    expect(store.phase).toBe('question')
    expect(store.result).toBeNull()
    expect(store.current).toBe(0)
  })

  it('поздний ответ check после «Пройти ещё раз» не применяется', async () => {
    get.mockResolvedValue(quiz(true))
    await store.start(TOKEN, NO_SHUFFLE)
    let release: (value: { correct: number[] }) => void = () => {}
    check.mockReturnValue(new Promise((resolve) => { release = resolve }))
    store.toggle(0)
    store.toggle(1)
    const pending = store.submit()
    await store.start()
    release({ correct: [0, 1] })
    await pending
    expect(store.phase).toBe('question')
    expect(store.correct).toEqual([])
  })

  it('поздний ответ finish после «Пройти ещё раз» не применяется', async () => {
    get.mockResolvedValue(quiz(false))
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    let release: (value: { result: typeof RESULT }) => void = () => {}
    finish.mockReturnValue(new Promise((resolve) => { release = resolve }))
    store.toggle(0)
    const pending = store.submit()
    await store.start()
    release({ result: RESULT })
    await pending
    expect(store.phase).toBe('question')
    expect(store.result).toBeNull()
  })

  it('двойной submit — один вызов check', async () => {
    get.mockResolvedValue(quiz(true))
    check.mockResolvedValue({ correct: [0, 1] })
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await Promise.all([store.submit(), store.submit()])
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('перезапуск даёт новое перемешивание', async () => {
    get.mockResolvedValue(quiz(false))
    await store.start(TOKEN, NO_SHUFFLE)
    expect(store.question!.options.map((option) => option.index)).toEqual([0, 1, 2])
    await store.start(undefined, () => 0)
    expect(store.question!.options.map((option) => option.index)).toEqual([1, 2, 0])
  })

  it('feedback: верно, частично, неверно', async () => {
    get.mockResolvedValue(quiz(true))
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    check.mockResolvedValue({ correct: [0, 1] })
    await store.submit()
    expect(store.feedback).toBe('correct')
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    check.mockResolvedValue({ correct: [0, 2] })
    await store.submit()
    expect(store.feedback).toBe('partial')
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    check.mockResolvedValue({ correct: [2] })
    await store.submit()
    expect(store.feedback).toBe('wrong')
  })
})
