import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { playApi } from '@/entities/quiz'
import { usePlayStore } from './store'
import type { PlayTimerView } from '@/features/play-session'
import { useQuizPlayTimer } from './useQuizPlayTimer'

vi.mock('@/entities/quiz', () => ({
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const START = new Date('2026-01-01T10:00:00Z').getTime()
const SECOND = 1000
const RESULT = { percent: 0, grade: null, correctCount: 0, partialCount: 0, totalCount: 1 }

let view: PlayTimerView
let store: ReturnType<typeof usePlayStore>
let expire: ReturnType<typeof vi.spyOn>
const mounted: { unmount: () => void }[] = []

const Harness = defineComponent({
  setup() {
    view = useQuizPlayTimer()
    return () => null
  },
})

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

async function startWith(timer: unknown): Promise<void> {
  vi.mocked(playApi.get).mockResolvedValue({
    type: 'quiz',
    quiz: {
      title: 'Quiz',
      showAnswers: false,
      timer,
      version: 'v1',
      questions: [{ text: 'Q', imageUrl: null, options: [{ text: 'a', imageUrl: null }, { text: 'b', imageUrl: null }], selectCount: 1 }],
    },
  } as never)
  await store.start(TOKEN, () => 0.99)
  await flushPromises()
}

async function advance(seconds: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(seconds * SECOND)
}

beforeEach(async () => {
  vi.resetAllMocks()
  vi.mocked(playApi.finish).mockResolvedValue({ result: RESULT })
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(START)
  mounted.push(await mountSuspended(Harness))
  store = usePlayStore()
  expire = vi.spyOn(store, 'expire')
})

afterEach(() => {
  expire.mockRestore()
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  setVisibility('visible')
  vi.useRealTimers()
})

describe('useQuizTimer: лимит', () => {
  it('expire вызывается ровно один раз на 60-й секунде и не раньше', async () => {
    await startWith({ mode: 'limit', seconds: 60 })
    await advance(59)
    expect(view.remainingSeconds.value).toBe(1)
    expect(expire).not.toHaveBeenCalled()

    await advance(1)
    expect(view.remainingSeconds.value).toBe(0)
    expect(expire).toHaveBeenCalledTimes(1)

    await advance(30)
    expect(expire).toHaveBeenCalledTimes(1)
  })

  it('остаток уменьшается каждую секунду', async () => {
    await startWith({ mode: 'limit', seconds: 600 })
    expect(view.remainingSeconds.value).toBe(600)
    await advance(5)
    expect(view.remainingSeconds.value).toBe(595)
    expect(view.elapsedSeconds.value).toBe(5)
  })

  it('отсчёт по Date.now(): сдвиг часов на минуту вперёд даёт истечение на ближайшем тике', async () => {
    await startWith({ mode: 'limit', seconds: 60 })
    vi.setSystemTime(START + 60 * SECOND)
    expect(expire).not.toHaveBeenCalled()
    await advance(1)
    expect(expire).toHaveBeenCalledTimes(1)
  })

  it('visibilitychange в «visible» пересчитывает остаток без ожидания тика', async () => {
    await startWith({ mode: 'limit', seconds: 60 })
    setVisibility('hidden')
    vi.setSystemTime(START + 61 * SECOND)
    expect(expire).not.toHaveBeenCalled()
    setVisibility('visible')
    expect(view.remainingSeconds.value).toBe(0)
    expect(expire).toHaveBeenCalledTimes(1)
  })

  it('visibilitychange в «hidden» не пересчитывает', async () => {
    await startWith({ mode: 'limit', seconds: 60 })
    vi.setSystemTime(START + 61 * SECOND)
    setVisibility('hidden')
    expect(expire).not.toHaveBeenCalled()
  })

  it('после размонтирования тикер остановлен: вызовов нет', async () => {
    await startWith({ mode: 'limit', seconds: 60 })
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    await advance(120)
    expect(expire).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    vi.setSystemTime(START + 200 * SECOND)
    setVisibility('visible')
    expect(expire).not.toHaveBeenCalled()
  })

  it('после истечения тикер останавливается', async () => {
    await startWith({ mode: 'limit', seconds: 60 })
    await advance(60)
    await flushPromises()
    expect(store.timedOut).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('useQuizTimer: порог «мало времени»', () => {
  it('лимит 600 с: порог 60 с (минимум из 60 и 25%)', async () => {
    await startWith({ mode: 'limit', seconds: 600 })
    await advance(539)
    expect(view.remainingSeconds.value).toBe(61)
    expect(view.isLow.value).toBe(false)
    await advance(1)
    expect(view.remainingSeconds.value).toBe(60)
    expect(view.isLow.value).toBe(true)
  })

  it('короткий лимит 60 с: порог 15 с (25%)', async () => {
    await startWith({ mode: 'limit', seconds: 60 })
    await advance(44)
    expect(view.remainingSeconds.value).toBe(16)
    expect(view.isLow.value).toBe(false)
    await advance(1)
    expect(view.remainingSeconds.value).toBe(15)
    expect(view.isLow.value).toBe(true)
  })

  it('длинный лимит 180 мин: порог всё равно 60 с', async () => {
    await startWith({ mode: 'limit', seconds: 180 * 60 })
    vi.setSystemTime(START + (180 * 60 - 62) * SECOND)
    await advance(1)
    expect(view.remainingSeconds.value).toBe(61)
    expect(view.isLow.value).toBe(false)
    await advance(1)
    expect(view.remainingSeconds.value).toBe(60)
    expect(view.isLow.value).toBe(true)
  })

  it('объявление звучит один раз на пороге, а не каждую секунду', async () => {
    await startWith({ mode: 'limit', seconds: 60 })
    expect(view.announcement.value).toBe('')
    await advance(45)
    expect(view.announcement.value).toBe('Осталось мало времени: 0:15')
    await advance(1)
    expect(view.announcement.value).toBe('Осталось мало времени: 0:15')
    await advance(10)
    expect(view.announcement.value).toBe('Осталось мало времени: 0:15')
  })

  it('при окончании объявляется «Время вышло»', async () => {
    await startWith({ mode: 'limit', seconds: 60 })
    await advance(60)
    await flushPromises()
    expect(view.announcement.value).toBe('Время вышло')
  })
})

describe('useQuizTimer: режимы без лимита', () => {
  it('none: тикер не стартует, expire не вызывается', async () => {
    await startWith({ mode: 'none' })
    expect(vi.getTimerCount()).toBe(0)
    await advance(600)
    expect(expire).not.toHaveBeenCalled()
    expect(view.remainingSeconds.value).toBeNull()
    expect(view.isLow.value).toBe(false)
  })

  it('stopwatch: секунды растут, expire не вызывается', async () => {
    await startWith({ mode: 'stopwatch' })
    expect(vi.getTimerCount()).toBe(1)
    await advance(3600)
    expect(view.elapsedSeconds.value).toBe(3600)
    expect(view.remainingSeconds.value).toBeNull()
    expect(view.isLow.value).toBe(false)
    expect(view.announcement.value).toBe('')
    expect(expire).not.toHaveBeenCalled()
  })

  it('stopwatch: после результата счёт замораживается значением из стора', async () => {
    await startWith({ mode: 'stopwatch' })
    await advance(10)
    store.toggle(0)
    await store.submit()
    await flushPromises()
    expect(store.phase).toBe('result')
    await advance(30)
    expect(view.elapsedSeconds.value).toBe(store.elapsedSeconds)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('useQuizTimer: интервал', () => {
  async function questionsQuiz(): Promise<void> {
    vi.mocked(playApi.get).mockResolvedValue({
      type: 'quiz',
      quiz: {
        title: 'Quiz',
        showAnswers: true,
        timer: { mode: 'limit', seconds: 600 },
        version: 'v1',
        questions: [
          { text: 'Q1', imageUrl: null, options: [{ text: 'a', imageUrl: null }, { text: 'b', imageUrl: null }], selectCount: 1 },
          { text: 'Q2', imageUrl: null, options: [{ text: 'c', imageUrl: null }, { text: 'd', imageUrl: null }], selectCount: 1 },
        ],
      },
    } as never)
    vi.mocked(playApi.check).mockResolvedValue({ correct: [0] })
    await store.start(TOKEN, () => 0.99)
    await flushPromises()
  }

  it('смена вопроса и фазы не пересоздаёт интервал, перезапуск игры пересоздаёт', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    await questionsQuiz()
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    store.toggle(0)
    await store.submit()
    await flushPromises()
    expect(store.phase).toBe('feedback')
    await store.next()
    await advance(5)
    await flushPromises()
    expect(store.current).toBe(1)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)

    vi.setSystemTime(START + 100 * SECOND)
    await store.start()
    await flushPromises()
    expect(setIntervalSpy).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
    setIntervalSpy.mockRestore()
  })
})
