import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntroEntrance, IntroEntranceTargets } from '@/entities/intro-theme'
import { PLAYER_ENTRANCE_KEY, type PlayerEntrance } from '@/features/play-session'
import TrueFalsePlay from './TrueFalsePlay.vue'
import { useTrueFalsePlayStore } from './store'

vi.mock('@/entities/true-false', () => ({ trueFalsePlayApi: { check: vi.fn(), finish: vi.fn() } }))
vi.mock('@/entities/quiz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/quiz')>()),
  playApi: { get: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const SOURCE = { kind: 'share', token: TOKEN } as const
const START = new Date('2026-01-01T10:00:00Z').getTime()
const SECOND = 1000
const FLIGHT_MS = 5 * SECOND
const LIMIT_SECONDS = 60
const FAKE_TIMERS = ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] as const

function initial(timer: unknown = { mode: 'none' }) {
  return {
    type: 'truefalse' as const,
    trueFalse: { title: 'Факты', showAnswers: false, version: 'v1', timer, statements: ['Земля плоская', 'Вода мокрая'] },
  } as never
}

// Вылет подменён: проверяется договор игры с проигрывателем, а не движение
function fakeEntrance() {
  const state: { targets: IntroEntranceTargets | null; land: () => void } = { targets: null, land: () => {} }
  const entrance: IntroEntrance = {
    run: vi.fn((targets: IntroEntranceTargets) => {
      state.targets = targets
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

async function mountPlay(context: PlayerEntrance | null, response = initial()) {
  const provide = context ? { [PLAYER_ENTRANCE_KEY as symbol]: context } : {}
  const wrapper = await mountSuspended(TrueFalsePlay, { props: { source: SOURCE, initial: response }, attachTo: document.body, global: { provide } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => vi.resetAllMocks())

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TrueFalsePlay: вылет первого утверждения (тема кодом)', () => {
  it('вылетают утверждение, подсказка и обе кнопки по порядку, потолок дорожки — верх экрана задания', async () => {
    const { entrance, state } = fakeEntrance()
    await mountPlay(playerContext(entrance))

    expect(entrance.run).toHaveBeenCalledTimes(1)
    expect(state.targets!.items.map((item) => item.className.split(' ')[0])).toEqual([
      'statement-card',
      'true-false-play__hint',
      'answer-buttons__button',
      'answer-buttons__button',
    ])
    // Полосы прогресса больше нет: над карточкой ничего не стоит, граница — блок экрана, содержащий карточку
    expect(state.targets!.ceiling?.classList.contains('true-false-play__screen')).toBe(true)
  })

  it('фокус на утверждении и перезапуск отсчёта — только после приземления', async () => {
    const store = useTrueFalsePlayStore()
    const restartClock = vi.spyOn(store, 'restartClock')
    const { entrance, state } = fakeEntrance()
    const wrapper = await mountPlay(playerContext(entrance))

    expect(document.activeElement).not.toBe(wrapper.get('.statement-card').element)
    expect(restartClock).not.toHaveBeenCalled()

    state.land()
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('.statement-card').element)
    expect(restartClock).toHaveBeenCalledTimes(1)
  })

  it('без проигрывателя как раньше: отсчёт не перезапускается, фокус сразу на утверждении', async () => {
    const store = useTrueFalsePlayStore()
    const restartClock = vi.spyOn(store, 'restartClock')
    const wrapper = await mountPlay(null)

    expect(restartClock).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(wrapper.get('.statement-card').element)
    expect(wrapper.find('.entrance-card--framed').exists()).toBe(false)
  })

  it('время вылета не съедает лимит: отсчёт 60 с идёт от приземления', async () => {
    vi.useFakeTimers({ toFake: [...FAKE_TIMERS] })
    vi.setSystemTime(START)
    const store = useTrueFalsePlayStore()
    const { entrance, state } = fakeEntrance()
    const wrapper = await mountPlay(playerContext(entrance), initial({ mode: 'limit', seconds: LIMIT_SECONDS }))

    await vi.advanceTimersByTimeAsync(FLIGHT_MS)
    state.land()
    await flushPromises()
    expect(store.startedAt).toBe(START + FLIGHT_MS)

    await vi.advanceTimersByTimeAsync((LIMIT_SECONDS - 1) * SECOND)
    await flushPromises()
    expect(store.timedOut).toBe(false)
    expect(wrapper.get('.play-timer__time').text()).toBe('0:01')
  })

  it('повторный показ игры в том же проигрывателе — без второго вылета', async () => {
    const { entrance, state } = fakeEntrance()
    const context = playerContext(entrance)
    await mountPlay(context)
    state.land()
    await flushPromises()

    await mountPlay(context)
    expect(entrance.run).toHaveBeenCalledTimes(1)
  })
})

describe('useTrueFalsePlayStore.restartClock', () => {
  it('до загрузки задания ничего не запускает, после — ставит отсчёт на текущий момент', async () => {
    vi.useFakeTimers({ toFake: [...FAKE_TIMERS] })
    vi.setSystemTime(START)
    const store = useTrueFalsePlayStore()
    store.dispose()
    store.restartClock()
    expect(store.startedAt).toBeNull()

    await store.start(SOURCE, initial())
    vi.setSystemTime(START + FLIGHT_MS)
    store.restartClock()
    expect(store.startedAt).toBe(START + FLIGHT_MS)
  })
})
