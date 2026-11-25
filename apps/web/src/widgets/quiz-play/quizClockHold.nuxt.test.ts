import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntroEntrance, IntroEntranceTargets } from '@/entities/intro-theme'
import { playApi } from '@/entities/quiz'
import { PLAYER_ENTRANCE_KEY, type PlayerEntrance } from '@/features/play-session'
import QuizPlay from './QuizPlay.vue'
import { ANSWER_ADVANCE_MS, usePlayStore } from './store'

vi.mock('@/entities/quiz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/quiz')>()),
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const SOURCE = { kind: 'share', token: TOKEN } as const
const BAD_TOKEN = 'short'
const START = new Date('2026-01-01T10:00:00Z').getTime()
const SECOND = 1000
const FLIGHT_MS = 5 * SECOND
const LIMIT_SECONDS = 60
const SHORT_LIMIT_SECONDS = 5
const LONG_FLIGHT_MS = 10 * SECOND
const AFTER_LANDING_MS = 3 * SECOND
const FAKE_TIMERS = ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] as const

// Вылет подменён: проверяется договор игры с проигрывателем, а не движение
function fakeEntrance() {
  const state: { land: () => void } = { land: () => {} }
  const entrance: IntroEntrance = {
    run: vi.fn((targets: IntroEntranceTargets) => {
      targets.onReady()
      return new Promise<void>((resolve) => (state.land = resolve))
    }),
    cancel: vi.fn(() => state.land()),
  }
  return { entrance, state }
}

function playerContext(entrance: IntroEntrance | null): PlayerEntrance {
  let taken = false
  return {
    framed: true,
    take: () => {
      if (taken) return null
      taken = true
      return entrance
    },
  }
}

const mounted: { unmount: () => void }[] = []

async function mountPlay(context: PlayerEntrance | null, response: unknown) {
  const provide = context ? { [PLAYER_ENTRANCE_KEY as symbol]: context } : {}
  const wrapper = await mountSuspended(QuizPlay, { props: { source: SOURCE, initial: response as never }, attachTo: document.body, global: { provide } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

const PLAY_MS = 7 * SECOND
const RESULT = { percent: 100, grade: null, correctCount: 1, partialCount: 0, totalCount: 1 }
const finishApi = vi.mocked(playApi.finish)

function initial(timer: unknown = { mode: 'none' }) {
  return {
    type: 'quiz' as const,
    quiz: {
      title: 'Quiz',
      showAnswers: false,
      timer,
      version: 'v1',
      questions: [{ text: 'Q1', imageUrl: null, options: [{ text: 'a', imageUrl: null }, { text: 'b', imageUrl: null }], selectCount: 1 }],
    },
  } as never
}

// Стор живёт между тестами файла: без сброса вопрос прошлого теста монтируется до start() и забирает вылет
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(playApi.finish).mockResolvedValue({ result: RESULT })
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['ru-RU'])
  vi.useFakeTimers({ toFake: [...FAKE_TIMERS] })
  vi.setSystemTime(START)
  usePlayStore().status = 'loading'
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('QuizPlay: видимый таймер во время вылета первого задания', () => {
  it('лимит стоит на полном значении весь полёт, после приземления идёт', async () => {
    const store = usePlayStore()
    const { entrance, state } = fakeEntrance()
    const wrapper = await mountPlay(playerContext(entrance), initial({ mode: 'limit', seconds: LIMIT_SECONDS }))
    expect(store.startedAt).toBeNull()
    expect(wrapper.get('.play-timer__time').text()).toBe('1:00')

    await vi.advanceTimersByTimeAsync(FLIGHT_MS)
    expect(wrapper.get('.play-timer__time').text()).toBe('1:00')
    expect(store.timedOut).toBe(false)

    state.land()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(AFTER_LANDING_MS)
    expect(wrapper.get('.play-timer__time').text()).toBe('0:57')
  })

  it('полёт дольше лимита не завершает задание: время не вышло', async () => {
    const store = usePlayStore()
    const { entrance, state } = fakeEntrance()
    const wrapper = await mountPlay(playerContext(entrance), initial({ mode: 'limit', seconds: SHORT_LIMIT_SECONDS }))

    await vi.advanceTimersByTimeAsync(LONG_FLIGHT_MS)
    expect(store.timedOut).toBe(false)
    expect(finishApi).not.toHaveBeenCalled()
    expect(wrapper.get('.play-timer__time').text()).toBe('0:05')

    state.land()
    await flushPromises()
    expect(store.startedAt).toBe(START + LONG_FLIGHT_MS)
  })

  it('без вылета (нет проигрывателя) отсчёт идёт сразу', async () => {
    const wrapper = await mountPlay(null, initial({ mode: 'limit', seconds: LIMIT_SECONDS }))
    await vi.advanceTimersByTimeAsync(AFTER_LANDING_MS)
    expect(wrapper.get('.play-timer__time').text()).toBe('0:57')
  })
})

describe('usePlayStore.holdClock / restartClock', () => {
  it('до загрузки задания holdClock ничего не придерживает: restartClock отсчёт не запускает', async () => {
    const store = usePlayStore()
    await store.start({ kind: 'share', token: BAD_TOKEN })
    store.holdClock()
    expect(store.startedAt).toBeNull()
    store.restartClock()
    expect(store.startedAt).toBeNull()
  })

  it('holdClock останавливает отсчёт, restartClock ставит его на момент приземления', async () => {
    const store = usePlayStore()
    await store.start(SOURCE, () => 0.99, initial())
    expect(store.startedAt).toBe(START)

    store.holdClock()
    expect(store.startedAt).toBeNull()
    vi.setSystemTime(START + FLIGHT_MS)
    store.restartClock()
    expect(store.startedAt).toBe(START + FLIGHT_MS)
  })

  it('повторный holdClock не теряет придержанный отсчёт', async () => {
    const store = usePlayStore()
    await store.start(SOURCE, () => 0.99, initial())
    store.holdClock()
    store.holdClock()
    vi.setSystemTime(START + FLIGHT_MS)
    store.restartClock()
    expect(store.startedAt).toBe(START + FLIGHT_MS)
  })

  it('время в итоге считается от приземления, полёт в него не входит', async () => {
    const store = usePlayStore()
    await store.start(SOURCE, () => 0.99, initial())
    store.holdClock()
    vi.setSystemTime(START + FLIGHT_MS)
    store.restartClock()
    // Выбор засчитывается сам, итог приходит после автоперехода: к нему проходит ровно PLAY_MS
    vi.setSystemTime(START + FLIGHT_MS + PLAY_MS - ANSWER_ADVANCE_MS)
    store.toggle(0)
    await vi.advanceTimersByTimeAsync(ANSWER_ADVANCE_MS)
    expect(store.elapsedSeconds).toBe(PLAY_MS / SECOND)
  })

  // Последним в файле: стор живёт между тестами, и невыполненный сброс флага не должен задеть соседей
  it('сброс прохождения снимает придержку: после неудачного старта restartClock отсчёт не запускает', async () => {
    const store = usePlayStore()
    await store.start(SOURCE, () => 0.99, initial())
    store.holdClock()
    await store.start({ kind: 'share', token: BAD_TOKEN })
    expect(store.status).toBe('notFound')
    store.restartClock()
    expect(store.startedAt).toBeNull()
  })
})
