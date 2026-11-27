import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { usePlayStore } from '../store'
import PlayResult from './PlayResult.vue'

vi.mock('@/entities/quiz', () => ({
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const SOURCE = { kind: 'share', token: TOKEN } as const
const mounted: { unmount: () => void }[] = []

async function startQuiz(timer: unknown) {
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
  const store = usePlayStore()
  await store.start(SOURCE, () => 0.99)
  return store
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('PlayResult: таймер', () => {
  const RESULT = { percent: 50, grade: '3', correctCount: 1, partialCount: 0, totalCount: 2 }

  async function finishQuiz(timer: unknown, expireInstead = false) {
    vi.mocked(playApi.finish).mockResolvedValue({ result: RESULT })
    const store = await startQuiz(timer)
    if (expireInstead) await store.expire()
    // Выбор засчитывается сам, итог приходит после автоперехода
    else {
      store.toggle(0)
      await vi.waitFor(() => expect(store.phase).toBe('result'))
    }
    expect(store.phase).toBe('result')
    const wrapper = await mountSuspended(PlayResult)
    mounted.push(wrapper)
    return wrapper
  }

  it('при истечении лимита показано примечание «Время вышло…», процент и оценка на месте', async () => {
    const wrapper = await finishQuiz({ mode: 'limit', seconds: 60 }, true)
    expect(wrapper.get('.play-result__note').text()).toBe('Время вышло: неотвеченные вопросы засчитаны как неверные')
    expect(wrapper.get('.play-result__percent').text()).toContain('50')
    expect(wrapper.get('.play-result__grade').text()).toContain('3')
  })

  it('лимит, уложился вовремя: примечания нет и времени нет', async () => {
    const wrapper = await finishQuiz({ mode: 'limit', seconds: 60 })
    expect(wrapper.find('.play-result__note').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Время:')
  })

  it('секундомер: строка «Время: м:сс»', async () => {
    const wrapper = await finishQuiz({ mode: 'stopwatch' })
    const store = usePlayStore()
    store.elapsedSeconds = 222
    await flushPromises()
    expect(wrapper.text()).toContain('Время: 3:42')
    expect(wrapper.find('.play-result__note').exists()).toBe(false)
  })

  it('без таймера: ни примечания, ни времени', async () => {
    const wrapper = await finishQuiz({ mode: 'none' })
    expect(wrapper.find('.play-result__note').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Время')
    expect(wrapper.get('.play-result__percent').text()).toContain('50')
  })
})
