import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { trueFalsePlayApi } from '@/entities/true-false'
import { ANSWER_ADVANCE_MS, ANSWER_FEEDBACK_MS, useTrueFalsePlayStore } from './store'

vi.mock('@/entities/quiz', () => ({ playApi: { get: vi.fn() } }))
vi.mock('@/entities/true-false', () => ({ trueFalsePlayApi: { check: vi.fn(), finish: vi.fn() } }))

const get = vi.mocked(playApi.get)
const check = vi.mocked(trueFalsePlayApi.check)
const finish = vi.mocked(trueFalsePlayApi.finish)

const TOKEN = 'abcdefghijklmnopqrstuv'
const MAX_ITEMS = 30
const RESULT = { percent: 50, grade: '3', correctCount: 15, partialCount: 0, totalCount: MAX_ITEMS }

function trueFalse(count: number, showAnswers: boolean) {
  return {
    type: 'truefalse' as const,
    trueFalse: { title: 'Факты', showAnswers, version: 'v1', timer: { mode: 'none' as const }, statements: Array.from({ length: count }, (_, i) => 'S' + i) },
  }
}

let store: ReturnType<typeof useTrueFalsePlayStore>

// Ответ и ожидание автоперехода (хватает и для задержки без показа ответов)
async function pass(value: boolean): Promise<void> {
  await store.answer(value)
  await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  setActivePinia(createPinia())
  store = useTrueFalsePlayStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTrueFalsePlayStore: граничные случаи', () => {
  it('30 утверждений без показа ответов: finish уходит один раз с 30 ответами в порядке показа', async () => {
    finish.mockResolvedValue({ result: RESULT })
    await store.start(TOKEN, trueFalse(MAX_ITEMS, false))

    for (let i = 0; i < MAX_ITEMS; i++) await pass(i % 3 === 0)

    expect(finish).toHaveBeenCalledOnce()
    expect(finish.mock.calls[0]?.[1].answers).toEqual(Array.from({ length: MAX_ITEMS }, (_, i) => i % 3 === 0))
    expect(check).not.toHaveBeenCalled()
    expect(store.phase).toBe('result')
  })

  it('30 утверждений с показом ответов: 30 check с индексами 0…29, затем один finish', async () => {
    check.mockResolvedValue({ correct: true })
    finish.mockResolvedValue({ result: RESULT, review: Array.from({ length: MAX_ITEMS }, () => ({ correct: true, answer: true })) })
    await store.start(TOKEN, trueFalse(MAX_ITEMS, true))

    for (let i = 0; i < MAX_ITEMS; i++) {
      await pass(true)
    }

    expect(check.mock.calls.map((call) => call[1].index)).toEqual(Array.from({ length: MAX_ITEMS }, (_, i) => i))
    expect(finish).toHaveBeenCalledOnce()
    expect(store.review).toHaveLength(MAX_ITEMS)
  })

  it('двойной быстрый клик без показа ответов: засчитан только первый, второе утверждение не пропущено', async () => {
    await store.start(TOKEN, trueFalse(3, false))

    const first = store.answer(true)
    const second = store.answer(false)
    await Promise.all([first, second])
    await vi.advanceTimersByTimeAsync(ANSWER_ADVANCE_MS)

    expect(store.answers).toEqual([true, null, null])
    expect(store.current).toBe(1)
  })

  it('минимум: 2 утверждения, оба неотвеченные по таймеру — finish с [null, null]', async () => {
    finish.mockResolvedValue({ result: { ...RESULT, percent: 0, correctCount: 0, totalCount: 2 } })
    await store.start(TOKEN, trueFalse(2, false))

    await store.expire()

    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [null, null] })
    expect(store.phase).toBe('result')
  })

  it('«Пройти ещё раз» во время check: поздний ответ старого прохождения не меняет новое', async () => {
    let resolveCheck: (value: { correct: boolean }) => void = () => {}
    check.mockImplementationOnce(() => new Promise((resolve) => { resolveCheck = resolve }))
    get.mockResolvedValue(trueFalse(2, true))
    await store.start(TOKEN, trueFalse(2, true))
    const pending = store.answer(true)

    await store.start()
    resolveCheck({ correct: false })
    await pending

    expect(store.phase).toBe('question')
    expect(store.verdict).toBeNull()
    expect(store.answers).toEqual([null, null])
  })

  it('задание удалено во время игры: 404 на check — «не найдено»', async () => {
    const { ApiError } = await import('@/shared')
    check.mockRejectedValue(new ApiError(404))
    await store.start(TOKEN, trueFalse(2, true))

    await store.answer(true)

    expect(store.status).toBe('notFound')
  })

  it('задание удалено во время игры: 404 на finish — «не найдено», итога нет', async () => {
    const { ApiError } = await import('@/shared')
    finish.mockRejectedValue(new ApiError(404))
    await store.start(TOKEN, trueFalse(2, false))

    await pass(true)
    await pass(true)

    expect(store.status).toBe('notFound')
    expect(store.result).toBeNull()
  })
})
