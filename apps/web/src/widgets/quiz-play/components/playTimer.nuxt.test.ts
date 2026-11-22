import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { playApi } from '@/entities/quiz'
import { usePlayStore } from '../store'
import { PLAY_TIMER_KEY, type PlayTimerView } from '@/features/play-session'
import PlayResult from './PlayResult.vue'
import PlayTimer from './PlayTimer.vue'

vi.mock('@/entities/quiz', () => ({
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const mounted: { unmount: () => void }[] = []

function view(partial: { elapsed?: number; remaining?: number | null; low?: boolean }): PlayTimerView {
  return {
    elapsedSeconds: computed(() => partial.elapsed ?? 0),
    remainingSeconds: computed(() => partial.remaining ?? null),
    isLow: computed(() => partial.low ?? false),
    announcement: ref(''),
  }
}

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
  await store.start(TOKEN, () => 0.99)
  return store
}

async function mountTimer(timerView: PlayTimerView | null) {
  const wrapper = await mountSuspended(PlayTimer, { global: { provide: timerView ? { [PLAY_TIMER_KEY as symbol]: timerView } : {} } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('PlayTimer', () => {
  it('лимит: показывает остаток м:сс', async () => {
    await startQuiz({ mode: 'limit', seconds: 600 })
    const wrapper = await mountTimer(view({ remaining: 125 }))
    expect(wrapper.get('.play-timer__time').text()).toBe('2:05')
  })

  it('секундомер: показывает прошедшее время', async () => {
    await startQuiz({ mode: 'stopwatch' })
    const wrapper = await mountTimer(view({ elapsed: 222 }))
    expect(wrapper.get('.play-timer__time').text()).toBe('3:42')
  })

  it('мало времени: текст «Осталось мало», а не только цвет', async () => {
    await startQuiz({ mode: 'limit', seconds: 600 })
    const wrapper = await mountTimer(view({ remaining: 30, low: true }))
    expect(wrapper.get('.play-timer__low').text()).toBe('Осталось мало')
    expect(wrapper.classes()).toContain('play-timer--low')
  })

  it('достаточно времени: текста «Осталось мало» нет', async () => {
    await startQuiz({ mode: 'limit', seconds: 600 })
    const wrapper = await mountTimer(view({ remaining: 300 }))
    expect(wrapper.find('.play-timer__low').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Осталось мало')
  })

  it('role="timer" с подписью и без aria-live на цифрах', async () => {
    await startQuiz({ mode: 'limit', seconds: 600 })
    const wrapper = await mountTimer(view({ remaining: 300 }))
    expect(wrapper.attributes('role')).toBe('timer')
    expect(wrapper.attributes('aria-label')).toBe('Таймер')
    expect(wrapper.find('[aria-live]').exists()).toBe(false)
    expect(wrapper.attributes('aria-live')).toBeUndefined()
  })

  it('режим none: таймер не рисуется', async () => {
    await startQuiz({ mode: 'none' })
    const wrapper = await mountTimer(view({}))
    expect(wrapper.find('.play-timer').exists()).toBe(false)
  })

  it('без провайдера (inject пуст) таймер не рисуется и не падает', async () => {
    await startQuiz({ mode: 'limit', seconds: 600 })
    const wrapper = await mountTimer(null)
    expect(wrapper.find('.play-timer').exists()).toBe(false)
  })
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
