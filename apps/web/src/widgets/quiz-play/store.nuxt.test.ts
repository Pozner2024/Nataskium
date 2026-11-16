import type { QuizTimer } from '@nataskium/shared/schemas'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

function options(...texts: string[]) {
  return texts.map((text) => ({ text, imageUrl: null }))
}

function quiz(showAnswers: boolean) {
  return {
    quiz: {
      title: 'Столицы',
      showAnswers,
      timer: { mode: 'none' } as const,
      version: 'v1',
      questions: [
        { text: 'Q1', imageUrl: null, options: options('a', 'b', 'c'), selectCount: 2 },
        { text: 'Q2', imageUrl: null, options: options('d', 'e'), selectCount: 1 },
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

  it('selectCount = 1: клик по другому варианту заменяет выбор, повторный клик снимает', async () => {
    get.mockResolvedValue(quiz(false))
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    store.toggle(0)
    expect(store.isDisabled(1)).toBe(false)
    store.toggle(1)
    expect(store.selected).toEqual([1])
    expect(store.canSubmit).toBe(true)
    store.toggle(1)
    expect(store.selected).toEqual([])
  })

  it('selectCount = 1: после «Ответить» выбор не меняется', async () => {
    get.mockResolvedValue(quiz(true))
    check.mockResolvedValue({ correct: [0, 2] })
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    await store.next()
    store.toggle(0)
    check.mockResolvedValue({ correct: [1] })
    await store.submit()
    expect(store.phase).toBe('feedback')
    expect(store.isDisabled(1)).toBe(true)
    store.toggle(1)
    expect(store.selected).toEqual([0])
  })

  it('selectCount = 1: во время отправки (busy) выбор не меняется', async () => {
    get.mockResolvedValue(quiz(false))
    finish.mockReturnValue(new Promise(() => {}))
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    store.toggle(0)
    void store.submit()
    expect(store.busy).toBe(true)
    expect(store.isDisabled(1)).toBe(true)
    store.toggle(1)
    expect(store.selected).toEqual([0])
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

describe('usePlayStore: картинки', () => {
  const IMAGE_Q = 'https://storage.example/quiz-images/q.webp'
  const IMAGE_A = 'https://storage.example/quiz-images/a.webp'
  const IMAGE_C = 'https://storage.example/quiz-images/c.webp'

  it('перемешивание не теряет картинку варианта, вариант-картинка уходит исходным индексом', async () => {
    get.mockResolvedValue({
      quiz: {
        title: 'Картинки',
        showAnswers: false,
        timer: { mode: 'none' },
        version: 'v1',
        questions: [
          {
            text: 'Q1',
            imageUrl: IMAGE_Q,
            options: [
              { text: '', imageUrl: IMAGE_A },
              { text: 'b', imageUrl: null },
              { text: 'c', imageUrl: IMAGE_C },
            ],
            selectCount: 1,
          },
        ],
      },
    })
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, () => 0)
    expect(store.question!.imageUrl).toBe(IMAGE_Q)
    expect(store.question!.options).toEqual([
      { text: 'b', imageUrl: null, index: 1 },
      { text: 'c', imageUrl: IMAGE_C, index: 2 },
      { text: '', imageUrl: IMAGE_A, index: 0 },
    ])
    store.toggle(store.question!.options[2]!.index)
    await store.submit()
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [[0]] })
  })
})

describe('usePlayStore: таймер', () => {
  const START = new Date('2026-01-01T10:00:00Z').getTime()
  const MS = 1000

  function timedQuiz(showAnswers: boolean, timer: QuizTimer) {
    return { quiz: { ...quiz(showAnswers).quiz, timer } }
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('startedAt ставится после загрузки вопросов, а не раньше', async () => {
    let release: (value: ReturnType<typeof timedQuiz>) => void = () => {}
    get.mockReturnValue(new Promise((resolve) => { release = resolve }))
    const pending = store.start(TOKEN, NO_SHUFFLE)
    expect(store.startedAt).toBeNull()
    vi.setSystemTime(START + 5 * MS)
    release(timedQuiz(false, { mode: 'limit', seconds: 60 }))
    await pending
    expect(store.startedAt).toBe(START + 5 * MS)
    expect(store.timer).toEqual({ mode: 'limit', seconds: 60 })
  })

  it('expire: неотвеченные вопросы и неотправленный выбор уходят пустыми, ответ засчитан не будет', async () => {
    get.mockResolvedValue(timedQuiz(false, { mode: 'limit', seconds: 60 }))
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    store.toggle(0)
    await store.expire()
    expect(finish).toHaveBeenCalledTimes(1)
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [[0, 1], []] })
    expect(store.timedOut).toBe(true)
    expect(store.phase).toBe('result')
    expect(store.selected).toEqual([])
  })

  it('expire без единого ответа: все массивы пустые', async () => {
    get.mockResolvedValue(timedQuiz(false, { mode: 'limit', seconds: 60 }))
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    await store.expire()
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [[], []] })
  })

  it('в фазе feedback отправленный ответ остаётся засчитанным', async () => {
    get.mockResolvedValue(timedQuiz(true, { mode: 'limit', seconds: 60 }))
    check.mockResolvedValue({ correct: [0, 1] })
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    expect(store.phase).toBe('feedback')
    await store.expire()
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [[0, 1], []] })
  })

  it('selectCount = 1: после истечения времени (до ответа сервера) выбор не меняется', async () => {
    get.mockResolvedValue(timedQuiz(false, { mode: 'limit', seconds: 60 }))
    finish.mockReturnValue(new Promise(() => {}))
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    store.toggle(0)
    void store.expire()
    expect(store.timedOut).toBe(true)
    expect(store.phase).toBe('question')
    expect(store.isDisabled(1)).toBe(true)
    store.toggle(1)
    expect(store.selected).toEqual([])
  })

  it('второй expire не шлёт второй finish', async () => {
    get.mockResolvedValue(timedQuiz(false, { mode: 'limit', seconds: 60 }))
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    await Promise.all([store.expire(), store.expire()])
    await store.expire()
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('expire после результата ничего не делает', async () => {
    get.mockResolvedValue(timedQuiz(false, { mode: 'limit', seconds: 60 }))
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    store.toggle(0)
    await store.submit()
    expect(store.phase).toBe('result')
    await store.expire()
    expect(finish).toHaveBeenCalledTimes(1)
    expect(store.timedOut).toBe(false)
  })

  it('при незавершённом check порядок «check → finish», а поздний ответ check не открывает feedback', async () => {
    get.mockResolvedValue(timedQuiz(true, { mode: 'limit', seconds: 60 }))
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    const order: string[] = []
    let release: (value: { correct: number[] }) => void = () => {}
    check.mockImplementation(() => {
      order.push('check')
      return new Promise((resolve) => { release = resolve })
    })
    finish.mockImplementation(async () => {
      order.push('finish')
      return { result: RESULT }
    })
    store.toggle(0)
    store.toggle(1)
    const submitting = store.submit()
    const expiring = store.expire()
    await Promise.resolve()
    expect(finish).not.toHaveBeenCalled()
    release({ correct: [0, 1] })
    await Promise.all([submitting, expiring])
    expect(order).toEqual(['check', 'finish'])
    expect(store.correct).toEqual([])
    expect(store.phase).toBe('result')
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [[0, 1], []] })
  })

  it('сбой сети на finish: состояние ошибки, «Повторить» шлёт именно finish', async () => {
    get.mockResolvedValue(timedQuiz(true, { mode: 'limit', seconds: 60 }))
    finish.mockRejectedValueOnce(new ApiError(0)).mockResolvedValueOnce({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    await store.expire()
    expect(store.status).toBe('failed')
    expect(store.phase).toBe('question')
    await store.retry()
    expect(finish).toHaveBeenCalledTimes(2)
    expect(check).not.toHaveBeenCalled()
    expect(store.status).toBe('ready')
    expect(store.phase).toBe('result')
    expect(store.timedOut).toBe(true)
  })

  it('«Пройти ещё раз» сбрасывает startedAt, timedOut и elapsedSeconds', async () => {
    get.mockResolvedValue(timedQuiz(false, { mode: 'stopwatch' }))
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    vi.setSystemTime(START + 30 * MS)
    await store.expire()
    expect(store.timedOut).toBe(true)
    expect(store.elapsedSeconds).toBe(30)

    get.mockReturnValue(new Promise(() => {}))
    void store.start()
    expect(store.startedAt).toBeNull()
    expect(store.timedOut).toBe(false)
    expect(store.elapsedSeconds).toBeNull()
    expect(store.timer).toEqual({ mode: 'none' })
  })

  it('секундомер: elapsedSeconds фиксируется при получении результата', async () => {
    get.mockResolvedValue(timedQuiz(false, { mode: 'stopwatch' }))
    finish.mockImplementation(async () => {
      vi.setSystemTime(START + 222 * MS)
      return { result: RESULT }
    })
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    expect(store.elapsedSeconds).toBeNull()
    store.toggle(0)
    await store.submit()
    expect(store.elapsedSeconds).toBe(222)
    vi.setSystemTime(START + 900 * MS)
    expect(store.elapsedSeconds).toBe(222)
  })

  it('режим none: startedAt есть, но таймерных состояний нет', async () => {
    get.mockResolvedValue(quiz(false))
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    expect(store.timer).toEqual({ mode: 'none' })
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    store.toggle(0)
    await store.submit()
    expect(store.timedOut).toBe(false)
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [[0, 1], [0]] })
  })
  it('регрессия M2: expire при обычном finish в полёте не ставит timedOut и не шлёт второй finish', async () => {
    get.mockResolvedValue(timedQuiz(false, { mode: 'limit', seconds: 60 }))
    let release: (value: { result: typeof RESULT }) => void = () => {}
    finish.mockReturnValue(new Promise((resolve) => { release = resolve }))
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    store.toggle(0)
    const submitting = store.submit()
    expect(finish).toHaveBeenCalledTimes(1)

    vi.setSystemTime(START + 61 * MS)
    await store.expire()
    expect(store.timedOut).toBe(false)
    expect(finish).toHaveBeenCalledTimes(1)

    release({ result: RESULT })
    await submitting
    expect(store.phase).toBe('result')
    expect(store.timedOut).toBe(false)
  })

  it('expire после сбоя сети в обычном finish ставит timedOut и повторяет finish', async () => {
    get.mockResolvedValue(timedQuiz(false, { mode: 'limit', seconds: 60 }))
    finish.mockRejectedValueOnce(new ApiError(0)).mockResolvedValueOnce({ result: RESULT })
    await store.start(TOKEN, NO_SHUFFLE)
    store.toggle(0)
    store.toggle(1)
    await store.submit()
    store.toggle(0)
    await store.submit()
    expect(store.status).toBe('failed')
    expect(store.timedOut).toBe(false)

    vi.setSystemTime(START + 61 * MS)
    await store.expire()
    expect(store.timedOut).toBe(true)
    expect(finish).toHaveBeenCalledTimes(2)
    expect(store.phase).toBe('result')
  })
})
