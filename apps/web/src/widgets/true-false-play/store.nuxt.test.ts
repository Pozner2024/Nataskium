import type { QuizTimer } from '@nataskium/shared/schemas'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trueFalsePlayApi } from '@/entities/true-false'
import { playApi } from '@/entities/quiz'
import { ApiError } from '@/shared'
import { ANSWER_ADVANCE_MS, ANSWER_FEEDBACK_MS, useTrueFalsePlayStore } from './store'

vi.mock('@/entities/quiz', () => ({ playApi: { get: vi.fn() } }))
vi.mock('@/entities/true-false', () => ({ trueFalsePlayApi: { check: vi.fn(), finish: vi.fn() } }))

const get = vi.mocked(playApi.get)
const check = vi.mocked(trueFalsePlayApi.check)
const finish = vi.mocked(trueFalsePlayApi.finish)

const TOKEN = 'abcdefghijklmnopqrstuv'
const RESULT = { percent: 100, grade: '5', correctCount: 3, partialCount: 0, totalCount: 3 }

function trueFalse(showAnswers = true, timer: QuizTimer = { mode: 'none' }) {
  return {
    type: 'truefalse' as const,
    trueFalse: { title: 'Факты', showAnswers, version: 'v1', timer, statements: ['Земля плоская', 'Вода мокрая', 'Лёд горячий'] },
  }
}

let store: ReturnType<typeof useTrueFalsePlayStore>

async function startWith(response = trueFalse()): Promise<void> {
  await store.start(TOKEN, response)
}

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

describe('useTrueFalsePlayStore: загрузка', () => {
  it('initial из PlayPage: без второго запроса, утверждения в порядке сервера, ответы пусты', async () => {
    await startWith()

    expect(get).not.toHaveBeenCalled()
    expect(store.status).toBe('ready')
    expect(store.statements).toEqual(['Земля плоская', 'Вода мокрая', 'Лёд горячий'])
    expect(store.answers).toEqual([null, null, null])
    expect(store.statement).toBe('Земля плоская')
    expect(store.startedAt).not.toBeNull()
  })

  it('без initial — загружает сам', async () => {
    get.mockResolvedValue(trueFalse())
    await store.start(TOKEN)

    expect(get).toHaveBeenCalledWith(TOKEN)
    expect(store.statements).toHaveLength(3)
  })

  it('невалидный токен — «не найдено» без запроса', async () => {
    await store.start('../auth/me')

    expect(store.status).toBe('notFound')
    expect(get).not.toHaveBeenCalled()
  })

  it('по ссылке оказалась викторина — «не найдено»', async () => {
    get.mockResolvedValue({ type: 'quiz', quiz: { title: 'Q', showAnswers: false, timer: { mode: 'none' }, version: 'v1', questions: [] } })
    await store.start(TOKEN)

    expect(store.status).toBe('notFound')
  })

  it('404 — «не найдено», сетевая ошибка — «повторить», повтор грузит заново', async () => {
    get.mockRejectedValueOnce(new ApiError(404))
    await store.start(TOKEN)
    expect(store.status).toBe('notFound')

    get.mockRejectedValueOnce(new Error('network'))
    await store.start(TOKEN)
    expect(store.status).toBe('failed')

    get.mockResolvedValue(trueFalse())
    await store.retry()
    expect(store.status).toBe('ready')
  })
})

describe('useTrueFalsePlayStore: без показа ответов', () => {
  it('ответ ведёт к следующему утверждению через ANSWER_ADVANCE_MS, check не вызывается', async () => {
    await startWith(trueFalse(false))

    await store.answer(true)
    expect(store.current).toBe(0)
    expect(store.verdict).toBeNull()
    await vi.advanceTimersByTimeAsync(ANSWER_ADVANCE_MS - 1)
    expect(store.current).toBe(0)
    await vi.advanceTimersByTimeAsync(1)

    expect(check).not.toHaveBeenCalled()
    expect(store.current).toBe(1)
    expect(store.viewing).toBe(1)
    expect(store.phase).toBe('question')
    expect(store.answers).toEqual([true, null, null])
  })

  it('после последнего — finish с ответами по порядку, итог без review', async () => {
    finish.mockResolvedValue({ result: RESULT })
    await startWith(trueFalse(false))

    await pass(true)
    await pass(false)
    await pass(false)

    expect(finish).toHaveBeenCalledOnce()
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [true, false, false] })
    expect(store.phase).toBe('result')
    expect(store.result).toEqual(RESULT)
    expect(store.review).toBeNull()
  })

  it('повторный ответ во время задержки игнорируется', async () => {
    await startWith(trueFalse(false))

    await store.answer(true)
    await store.answer(false)
    await vi.advanceTimersByTimeAsync(ANSWER_ADVANCE_MS)

    expect(store.answers).toEqual([true, null, null])
    expect(store.current).toBe(1)
  })
})

describe('useTrueFalsePlayStore: с показом ответов', () => {
  it('ответ уходит в check с индексом и значением, вердикт сохраняется, переход через ANSWER_FEEDBACK_MS после ответа сервера', async () => {
    check.mockResolvedValue({ correct: false })
    await startWith()

    await store.answer(true)

    expect(check).toHaveBeenCalledWith(TOKEN, { version: 'v1', index: 0, answer: true })
    expect(store.verdict).toBe(false)
    expect(store.verdicts).toEqual([false, null, null])
    expect(store.current).toBe(0)
    await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS - 1)
    expect(store.current).toBe(0)
    await vi.advanceTimersByTimeAsync(1)

    expect(store.current).toBe(1)
    expect(store.verdict).toBeNull()
  })

  it('отсчёт задержки начинается после ответа сервера, а не после клика', async () => {
    let release: (value: { correct: boolean }) => void = () => {}
    check.mockReturnValue(new Promise((resolve) => (release = resolve)))
    await startWith()

    const answering = store.answer(true)
    await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS * 2)
    expect(store.current).toBe(0)
    release({ correct: true })
    await answering
    await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS)

    expect(store.current).toBe(1)
  })

  it('ответ сменить нельзя, повторный ответ не отправляется ни во время задержки, ни после', async () => {
    check.mockResolvedValue({ correct: true })
    await startWith()
    await store.answer(true)

    await store.answer(false)
    await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS)

    expect(check).toHaveBeenCalledTimes(1)
    expect(store.answers[0]).toBe(true)
  })

  it('второй ответ, пока check ещё в пути, не отправляется', async () => {
    let release: (value: { correct: boolean }) => void = () => {}
    check.mockReturnValue(new Promise((resolve) => (release = resolve)))
    await startWith()

    const first = store.answer(true)
    const second = store.answer(false)
    release({ correct: true })
    await Promise.all([first, second])

    expect(check).toHaveBeenCalledTimes(1)
    expect(check).toHaveBeenCalledWith(TOKEN, { version: 'v1', index: 0, answer: true })
    expect(store.answers[0]).toBe(true)
  })

  it('после последнего — finish; review сохраняется', async () => {
    check.mockResolvedValue({ correct: true })
    const review = [{ correct: true, answer: true }, { correct: true, answer: false }, { correct: false, answer: true }]
    finish.mockResolvedValue({ result: RESULT, review })
    await startWith()
    await pass(true)
    await pass(false)
    await pass(false)

    expect(finish).toHaveBeenCalledOnce()
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [true, false, false] })
    expect(store.phase).toBe('result')
    expect(store.review).toEqual(review)
  })
})

describe('useTrueFalsePlayStore: стрелки', () => {
  async function twoAnswered(): Promise<void> {
    check.mockResolvedValueOnce({ correct: false })
    check.mockResolvedValueOnce({ correct: true })
    await startWith()
    await pass(true)
    await pass(false)
  }

  it('prev() показывает прошлое утверждение с прежним ответом и вердиктом, ответить нельзя', async () => {
    await twoAnswered()

    store.prev()

    expect(store.viewing).toBe(1)
    expect(store.current).toBe(2)
    expect(store.statement).toBe('Вода мокрая')
    expect(store.verdict).toBe(true)
    expect(store.canAnswer).toBe(false)

    store.prev()
    expect(store.verdict).toBe(false)
    await store.answer(false)
    expect(check).toHaveBeenCalledTimes(2)
    expect(store.answers).toEqual([true, false, null])
  })

  it('forward() идёт вперёд, но не дальше текущего; на границах стрелки неактивны', async () => {
    await twoAnswered()
    expect(store.canPrev).toBe(true)
    expect(store.canForward).toBe(false)

    store.prev()
    store.prev()
    expect(store.canPrev).toBe(false)
    store.prev()
    expect(store.viewing).toBe(0)

    store.forward()
    store.forward()
    store.forward()
    expect(store.viewing).toBe(2)
    expect(store.canForward).toBe(false)
    expect(store.canAnswer).toBe(true)
  })

  it('на первом утверждении стрелка назад неактивна', async () => {
    await startWith()

    expect(store.canPrev).toBe(false)
    expect(store.canForward).toBe(false)
  })

  it('во время задержки автоперехода и запроса стрелки неактивны', async () => {
    check.mockResolvedValue({ correct: true })
    await startWith()
    await pass(true)

    await store.answer(true)
    expect(store.canPrev).toBe(false)
    store.prev()
    expect(store.viewing).toBe(1)

    await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS)
    expect(store.canPrev).toBe(true)
  })

  it('после перехода просматриваемое утверждение снова текущее', async () => {
    await twoAnswered()
    store.prev()

    store.forward()

    expect(store.verdict).toBeNull()
    expect(store.statement).toBe('Лёд горячий')
  })

  it('без показа ответов вердиктов нет, при просмотре виден только выбор', async () => {
    await startWith(trueFalse(false))
    await pass(true)

    store.prev()

    expect(store.verdict).toBeNull()
    expect(store.answers[0]).toBe(true)
    expect(store.verdicts).toEqual([null, null, null])
  })
})

describe('useTrueFalsePlayStore: таймеры автоперехода', () => {
  it('время вышло во время задержки: один finish, отложенный переход отменён', async () => {
    finish.mockResolvedValue({ result: RESULT })
    await startWith(trueFalse(false, { mode: 'limit', seconds: 60 }))
    await store.answer(true)

    await store.expire()
    await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS * 2)

    expect(finish).toHaveBeenCalledOnce()
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [true, null, null] })
    expect(store.current).toBe(0)
  })

  it('время вышло во время задержки после последнего ответа: finish один', async () => {
    finish.mockResolvedValue({ result: RESULT })
    await startWith(trueFalse(false, { mode: 'limit', seconds: 60 }))
    await pass(true)
    await pass(true)
    await store.answer(true)

    await store.expire()
    await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS * 2)

    expect(finish).toHaveBeenCalledOnce()
    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [true, true, true] })
  })

  it('dispose() во время задержки: finish не вызывается', async () => {
    finish.mockResolvedValue({ result: RESULT })
    await startWith(trueFalse(false))
    await pass(true)
    await pass(true)
    await store.answer(true)

    store.dispose()
    await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS * 2)

    expect(finish).not.toHaveBeenCalled()
  })

  it('start() сбрасывает отложенный переход прошлого прохождения', async () => {
    await startWith(trueFalse(false))
    await store.answer(true)
    get.mockResolvedValue(trueFalse(false))

    await store.start()
    await vi.advanceTimersByTimeAsync(ANSWER_FEEDBACK_MS)

    expect(store.current).toBe(0)
    expect(store.answers).toEqual([null, null, null])
  })
})

describe('useTrueFalsePlayStore: ошибки', () => {
  it('409 на check — «задание изменилось», «Начать заново» грузит заново', async () => {
    check.mockRejectedValue(new ApiError(409))
    await startWith()

    await pass(true)
    expect(store.status).toBe('changed')

    get.mockResolvedValue(trueFalse())
    await store.start()
    expect(store.status).toBe('ready')
    expect(store.answers).toEqual([null, null, null])
  })

  it('409 на finish — «задание изменилось»', async () => {
    finish.mockRejectedValue(new ApiError(409))
    await startWith(trueFalse(false))
    await pass(true)
    await pass(true)
    await pass(true)

    expect(store.status).toBe('changed')
  })

  it('сетевая ошибка check: повтор шлёт тот же ответ', async () => {
    check.mockRejectedValueOnce(new Error('network'))
    check.mockResolvedValueOnce({ correct: true })
    await startWith()

    await pass(false)
    expect(store.status).toBe('failed')

    await store.retry()

    expect(check).toHaveBeenCalledTimes(2)
    expect(check).toHaveBeenLastCalledWith(TOKEN, { version: 'v1', index: 0, answer: false })
    expect(store.status).toBe('ready')
    expect(store.verdict).toBe(true)
  })

  it('сетевая ошибка finish: повтор шлёт те же ответы', async () => {
    finish.mockRejectedValueOnce(new Error('network'))
    finish.mockResolvedValueOnce({ result: RESULT })
    await startWith(trueFalse(false))
    await pass(true)
    await pass(false)
    await pass(true)
    expect(store.status).toBe('failed')

    await store.retry()

    expect(finish).toHaveBeenLastCalledWith(TOKEN, { version: 'v1', answers: [true, false, true] })
    expect(store.phase).toBe('result')
  })
})

describe('useTrueFalsePlayStore: время вышло', () => {
  it('expire отправляет finish с null у неотвеченных и помечает timedOut', async () => {
    finish.mockResolvedValue({ result: RESULT })
    await startWith(trueFalse(false, { mode: 'limit', seconds: 60 }))
    await pass(true)

    await store.expire()

    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [true, null, null] })
    expect(store.timedOut).toBe(true)
    expect(store.phase).toBe('result')
  })

  it('после истечения ответить нельзя', async () => {
    finish.mockResolvedValue({ result: RESULT })
    await startWith(trueFalse(false, { mode: 'limit', seconds: 60 }))
    await store.expire()

    await pass(true)

    expect(store.answers).toEqual([null, null, null])
  })

  it('expire в фазе вердикта сохраняет уже проверенный ответ', async () => {
    check.mockResolvedValue({ correct: true })
    finish.mockResolvedValue({ result: RESULT })
    await startWith(trueFalse(true, { mode: 'limit', seconds: 60 }))
    await pass(true)

    await store.expire()

    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [true, null, null] })
  })

  it('expire во время check ждёт его, а finish не обгоняет check', async () => {
    let release: (value: { correct: boolean }) => void = () => {}
    check.mockReturnValue(new Promise((resolve) => (release = resolve)))
    finish.mockResolvedValue({ result: RESULT })
    await startWith(trueFalse(true, { mode: 'limit', seconds: 60 }))

    const answering = store.answer(true)
    const expiring = store.expire()
    expect(finish).not.toHaveBeenCalled()
    release({ correct: true })
    await Promise.all([answering, expiring])

    expect(finish).toHaveBeenCalledWith(TOKEN, { version: 'v1', answers: [true, null, null] })
    expect(store.phase).toBe('result')
  })

  it('expire после результата ничего не делает', async () => {
    finish.mockResolvedValue({ result: RESULT })
    await startWith(trueFalse(false))
    await pass(true)
    await pass(true)
    await pass(true)

    await store.expire()

    expect(finish).toHaveBeenCalledTimes(1)
    expect(store.timedOut).toBe(false)
  })
})

describe('useTrueFalsePlayStore: «Пройти ещё раз»', () => {
  it('start() сбрасывает прохождение и грузит задание заново', async () => {
    finish.mockResolvedValue({ result: RESULT })
    await startWith(trueFalse(false))
    await pass(true)
    await pass(true)
    await pass(true)
    get.mockResolvedValue(trueFalse(false))

    await store.start()

    expect(get).toHaveBeenCalledTimes(1)
    expect(store.phase).toBe('question')
    expect(store.result).toBeNull()
    expect(store.review).toBeNull()
    expect(store.current).toBe(0)
  })
})
