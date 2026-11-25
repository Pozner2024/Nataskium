import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { ApiError } from '@/shared'
import QuizPlay from './QuizPlay.vue'
import { usePlayStore } from './store'

vi.mock('@/entities/quiz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/quiz')>()),
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const SOURCE = { kind: 'share', token: TOKEN } as const
const START = new Date('2026-01-01T10:00:00Z').getTime()
const SECOND = 1000
const RESULT = { percent: 0, grade: null, correctCount: 0, partialCount: 1, totalCount: 1 }
const mounted: { unmount: () => void }[] = []

function body(timer: unknown) {
  return {
    type: 'quiz',
    quiz: {
      title: 'Quiz',
      showAnswers: true,
      timer,
      version: 'v1',
      questions: [{ text: 'Q', imageUrl: null, options: [{ text: 'a', imageUrl: null }, { text: 'b', imageUrl: null }], selectCount: 1 }],
    },
  } as never
}

async function mountPlay(timer: unknown) {
  vi.mocked(playApi.get).mockResolvedValue(body(timer))
  const wrapper = await mountSuspended(QuizPlay, { props: { source: SOURCE } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(playApi.finish).mockResolvedValue({ result: RESULT })
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['ru-RU'])
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(START)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('QuizPlay: таймер', () => {
  it('лимит: виден остаток, статусный регион пуст, скрытый role="status" объявляет только порог и конец', async () => {
    const wrapper = await mountPlay({ mode: 'limit', seconds: 60 })
    expect(wrapper.get('.play-timer__time').text()).toBe('1:00')
    expect(wrapper.get('.quiz-play__sr-only').text()).toBe('')

    await vi.advanceTimersByTimeAsync(10 * SECOND)
    expect(wrapper.get('.play-timer__time').text()).toBe('0:50')
    expect(wrapper.get('.quiz-play__sr-only').text()).toBe('')
    expect(wrapper.find('.play-timer [aria-live]').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(35 * SECOND)
    expect(wrapper.get('.play-timer__low').text()).toBe('Осталось мало')
    expect(wrapper.get('.quiz-play__sr-only').text()).toBe('Осталось мало времени: 0:15')
  })

  it('по истечении лимита уходит finish и показан итог с примечанием', async () => {
    const wrapper = await mountPlay({ mode: 'limit', seconds: 60 })
    await vi.advanceTimersByTimeAsync(60 * SECOND)
    await flushPromises()
    expect(playApi.finish).toHaveBeenCalledTimes(1)
    expect(playApi.finish).toHaveBeenCalledWith(SOURCE, { version: 'v1', answers: [[]] })
    expect(wrapper.get('.play-result__note').text()).toContain('Время вышло')
    expect(wrapper.get('.quiz-play__sr-only').text()).toBe('Время вышло')
  })

  it('режим none: таймера нет', async () => {
    const wrapper = await mountPlay({ mode: 'none' })
    expect(wrapper.find('.play-timer').exists()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('при ошибке (failed) компонент вопроса размонтирован, а тикер идёт и истекает', async () => {
    const wrapper = await mountPlay({ mode: 'limit', seconds: 60 })
    const store = usePlayStore()
    vi.mocked(playApi.check).mockRejectedValue(new ApiError(0))
    store.toggle(0)
    await store.submit()
    await flushPromises()
    expect(store.status).toBe('failed')
    expect(wrapper.find('.play-timer').exists()).toBe(false)

    vi.mocked(playApi.finish).mockRejectedValue(new ApiError(0))
    await vi.advanceTimersByTimeAsync(60 * SECOND)
    expect(store.timedOut).toBe(true)
    expect(playApi.finish).toHaveBeenCalledTimes(1)
  })

  it('при changed (409) тикер продолжает идти', async () => {
    await mountPlay({ mode: 'limit', seconds: 60 })
    const store = usePlayStore()
    vi.mocked(playApi.check).mockRejectedValue(new ApiError(409))
    store.toggle(0)
    await store.submit()
    await flushPromises()
    expect(store.status).toBe('changed')
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(30 * SECOND)
    expect(vi.getTimerCount()).toBe(1)
  })
})
