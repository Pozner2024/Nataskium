import type { QuizTimer } from '@nataskium/shared/schemas'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { matchingPlayApi } from '@/entities/matching'
import { playApi } from '@/entities/quiz'
import { ApiError } from '@/shared'
import { useMatchingPlayStore } from './store'

vi.mock('@/entities/quiz', () => ({ playApi: { get: vi.fn() } }))
vi.mock('@/entities/matching', () => ({ matchingPlayApi: { finish: vi.fn() } }))

const get = vi.mocked(playApi.get)
const finish = vi.mocked(matchingPlayApi.finish)

const TOKEN = 'abcdefghijklmnopqrstuv'
const SOURCE = { kind: 'share', token: TOKEN } as const
const RESULT = { percent: 100, grade: '5', correctCount: 3, partialCount: 0, totalCount: 3 }

function matching(timer: QuizTimer = { mode: 'none' }) {
  return {
    type: 'matching' as const,
    matching: {
      title: 'Животные',
      showAnswers: true,
      version: 'v1',
      introTheme: 'nataskium-night' as const,
      timer,
      definitions: ['Мяукает', 'Лает', 'Мычит'],
      terms: ['собака', 'корова', 'кошка'],
    },
  }
}

let store: ReturnType<typeof useMatchingPlayStore>

async function startWith(response = matching()): Promise<void> {
  await store.start(SOURCE, response)
}

beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  store = useMatchingPlayStore()
})

describe('useMatchingPlayStore: загрузка', () => {
  it('initial из PlayPage: без второго запроса, определения в порядке учителя, все слова в лотке', async () => {
    await startWith()

    expect(get).not.toHaveBeenCalled()
    expect(store.status).toBe('ready')
    expect(store.definitions).toEqual(['Мяукает', 'Лает', 'Мычит'])
    expect(store.pool).toEqual([0, 1, 2])
    expect(store.placements).toEqual([null, null, null])
    expect(store.startedAt).not.toBeNull()
  })

  it('без initial — загружает сам', async () => {
    get.mockResolvedValue(matching())
    await store.start(SOURCE)

    expect(get).toHaveBeenCalledWith(SOURCE)
    expect(store.terms).toEqual(['собака', 'корова', 'кошка'])
  })

  it('невалидный токен — «не найдено» без запроса', async () => {
    await store.start({ kind: 'share', token: '../auth/me' })

    expect(store.status).toBe('notFound')
    expect(get).not.toHaveBeenCalled()
  })

  it('по ссылке оказалась викторина — «не найдено»', async () => {
    get.mockResolvedValue({ type: 'quiz', quiz: { title: 'Q', showAnswers: false, timer: { mode: 'none' }, version: 'v1', introTheme: 'nataskium-night' as const, questions: [] } })
    await store.start(SOURCE)

    expect(store.status).toBe('notFound')
  })

  it('404 — «не найдено», сетевая ошибка — «повторить», повтор грузит заново', async () => {
    get.mockRejectedValueOnce(new ApiError(404))
    await store.start(SOURCE)
    expect(store.status).toBe('notFound')

    get.mockRejectedValueOnce(new Error('network'))
    await store.start(SOURCE)
    expect(store.status).toBe('failed')

    get.mockResolvedValueOnce(matching())
    await store.retry()
    expect(store.status).toBe('ready')
    expect(get).toHaveBeenCalledTimes(3)
  })
})

describe('useMatchingPlayStore: постановка', () => {
  beforeEach(() => startWith())

  it('слово ставится к определению и уходит из лотка', () => {
    expect(store.place(2, 0)).toEqual({ replaced: null })

    expect(store.placements).toEqual([2, null, null])
    expect(store.pool).toEqual([0, 1])
    expect(store.definitionOf(2)).toBe(0)
    expect(store.placedCount).toBe(1)
  })

  it('на занятое определение — замена: старое слово возвращается в лоток, обмена нет', () => {
    store.place(2, 0)
    expect(store.place(0, 0)).toEqual({ replaced: 2 })

    expect(store.placements).toEqual([0, null, null])
    expect(store.pool).toEqual([1, 2])
  })

  it('перенос поставленного слова на другое определение освобождает прежнее', () => {
    store.place(2, 0)
    store.place(1, 1)
    expect(store.place(2, 1)).toEqual({ replaced: 1 })

    expect(store.placements).toEqual([null, 2, null])
    expect(store.pool).toEqual([0, 1])
  })

  it('одно слово никогда не стоит у двух определений', () => {
    store.place(2, 0)
    store.place(2, 1)
    store.place(2, 2)

    expect(store.placements.filter((term) => term === 2)).toHaveLength(1)
    expect(store.placements).toEqual([null, null, 2])
  })

  it('на то же определение — ничего не меняется', () => {
    store.place(2, 0)
    expect(store.place(2, 0)).toBeNull()
    expect(store.placements).toEqual([2, null, null])
  })

  it('возврат слова в лоток', () => {
    store.place(2, 0)
    expect(store.unplace(0)).toBe(2)

    expect(store.placements).toEqual([null, null, null])
    expect(store.pool).toEqual([0, 1, 2])
    expect(store.unplace(0)).toBeNull()
  })

  it('несуществующие индексы игнорируются', () => {
    expect(store.place(5, 0)).toBeNull()
    expect(store.place(0, 7)).toBeNull()
    expect(store.placements).toEqual([null, null, null])
  })
})

describe('useMatchingPlayStore: выбор тапом', () => {
  beforeEach(() => startWith())

  it('тап выбирает слово, повторный тап снимает выбор', () => {
    store.pick(1)
    expect(store.picked).toBe(1)
    store.pick(1)
    expect(store.picked).toBeNull()
  })

  it('тап по другому слову переключает выбор, отмена снимает его', () => {
    store.pick(1)
    store.pick(2)
    expect(store.picked).toBe(2)
    store.cancelPick()
    expect(store.picked).toBeNull()
  })

  it('постановка снимает выбор', () => {
    store.pick(1)
    store.place(1, 2)
    expect(store.picked).toBeNull()
  })

  it('возврат выбранного поставленного слова снимает выбор', () => {
    store.place(1, 2)
    store.pick(1)
    store.unplace(2)
    expect(store.picked).toBeNull()
  })
})

describe('useMatchingPlayStore: проверка', () => {
  beforeEach(() => startWith())

  it('«Проверить» доступна только когда расставлены все слова', () => {
    store.place(2, 0)
    store.place(0, 1)
    expect(store.isComplete).toBe(false)
    expect(store.canCheck).toBe(false)

    store.place(1, 2)
    expect(store.isComplete).toBe(true)
    expect(store.canCheck).toBe(true)
  })

  it('check без полного набора не шлёт запрос', async () => {
    store.place(2, 0)
    await store.check()
    expect(finish).not.toHaveBeenCalled()
  })

  it('check шлёт тексты слов по индексу определения, итог и review сохраняются, расстановка остаётся', async () => {
    const review = [{ correct: true, term: 'кошка' }, { correct: true, term: 'собака' }, { correct: true, term: 'корова' }]
    finish.mockResolvedValue({ result: RESULT, review })
    store.place(2, 0)
    store.place(0, 1)
    store.place(1, 2)

    await store.check()

    expect(finish).toHaveBeenCalledWith(SOURCE, { version: 'v1', answers: ['кошка', 'собака', 'корова'] })
    expect(store.phase).toBe('result')
    expect(store.result).toEqual(RESULT)
    expect(store.review).toEqual(review)
    expect(store.placements).toEqual([2, 0, 1])
  })

  it('без showAnswers review нет', async () => {
    finish.mockResolvedValue({ result: RESULT })
    store.place(2, 0)
    store.place(0, 1)
    store.place(1, 2)
    await store.check()

    expect(store.review).toBeNull()
  })

  it('после проверки расстановка заблокирована', async () => {
    finish.mockResolvedValue({ result: RESULT })
    store.place(2, 0)
    store.place(0, 1)
    store.place(1, 2)
    await store.check()

    expect(store.unplace(0)).toBeNull()
    store.pick(0)
    expect(store.picked).toBeNull()
  })

  it('409 — «задание изменено»; перезапуск грузит заново', async () => {
    finish.mockRejectedValue(new ApiError(409))
    store.place(2, 0)
    store.place(0, 1)
    store.place(1, 2)
    await store.check()
    expect(store.status).toBe('changed')

    get.mockResolvedValue(matching())
    await store.start()
    expect(get).toHaveBeenCalledWith(SOURCE)
    expect(store.status).toBe('ready')
    expect(store.placements).toEqual([null, null, null])
  })

  it('сетевая ошибка проверки — «повторить» повторяет тот же ответ', async () => {
    finish.mockRejectedValueOnce(new Error('network'))
    finish.mockResolvedValueOnce({ result: RESULT })
    store.place(2, 0)
    store.place(0, 1)
    store.place(1, 2)
    await store.check()
    expect(store.status).toBe('failed')

    await store.retry()
    expect(finish).toHaveBeenCalledTimes(2)
    expect(finish.mock.calls[1]?.[1]).toEqual({ version: 'v1', answers: ['кошка', 'собака', 'корова'] })
    expect(store.phase).toBe('result')
  })

  it('«Пройти ещё раз» — новый GET и чистое состояние', async () => {
    finish.mockResolvedValue({ result: RESULT })
    store.place(2, 0)
    store.place(0, 1)
    store.place(1, 2)
    await store.check()

    get.mockResolvedValue(matching())
    await store.start()

    expect(get).toHaveBeenCalledTimes(1)
    expect(store.phase).toBe('play')
    expect(store.result).toBeNull()
    expect(store.review).toBeNull()
    expect(store.pool).toEqual([0, 1, 2])
  })

  it('dispose во время запроса сбрасывает busy в false', () => {
    finish.mockReturnValue(new Promise(() => {}))
    store.place(2, 0)
    store.place(0, 1)
    store.place(1, 2)
    void store.check()
    expect(store.busy).toBe(true)

    store.dispose()
    expect(store.busy).toBe(false)
    expect(store.status).toBe('loading')
  })
})

describe('useMatchingPlayStore: истечение времени', () => {
  beforeEach(() => startWith(matching({ mode: 'limit', seconds: 60 })))

  it('пустые определения уходят как null, выбор снимается', async () => {
    finish.mockResolvedValue({ result: { ...RESULT, percent: 33, correctCount: 1 } })
    store.place(2, 0)
    store.pick(1)

    await store.expire()

    expect(finish).toHaveBeenCalledWith(SOURCE, { version: 'v1', answers: ['кошка', null, null] })
    expect(store.timedOut).toBe(true)
    expect(store.picked).toBeNull()
    expect(store.phase).toBe('result')
  })

  it('после истечения ставить слова нельзя', async () => {
    finish.mockImplementation(() => new Promise(() => {}))
    void store.expire()

    expect(store.place(0, 0)).toBeNull()
    expect(store.canCheck).toBe(false)
  })

  it('«Проверить» уже отправлено — истечение не шлёт второй запрос и не ставит «Время вышло»', async () => {
    let resolve: (value: { result: typeof RESULT }) => void = () => {}
    finish.mockImplementation(() => new Promise((done) => { resolve = done }))
    store.place(2, 0)
    store.place(0, 1)
    store.place(1, 2)
    const checking = store.check()

    await store.expire()
    resolve({ result: RESULT })
    await checking

    expect(finish).toHaveBeenCalledTimes(1)
    expect(store.timedOut).toBe(false)
    expect(store.phase).toBe('result')
  })

  it('повторное истечение — один запрос', async () => {
    finish.mockResolvedValue({ result: RESULT })
    await store.expire()
    await store.expire()

    expect(finish).toHaveBeenCalledTimes(1)
  })
})

describe('useMatchingPlayStore: пауза «Как играть»', () => {
  it('ушли со страницы, не закрыв окно: в следующей игре отсчёт запускается после вылета', async () => {
    await startWith(matching({ mode: 'limit', seconds: 60 }))
    store.pauseClock()
    store.dispose()

    await startWith(matching({ mode: 'limit', seconds: 60 }))
    store.holdClock()
    store.restartClock()
    expect(store.startedAt).not.toBeNull()
  })
})
