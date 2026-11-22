import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntroEntrance, IntroEntranceTargets } from '@/entities/intro-theme'
import { PLAYER_ENTRANCE_KEY, type PlayerEntrance } from '@/features/play-session'
import MatchingPlay from './MatchingPlay.vue'
import { useMatchingPlayStore } from './store'

vi.mock('@/entities/matching', () => ({ matchingPlayApi: { finish: vi.fn() } }))
vi.mock('@/entities/quiz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/quiz')>()),
  playApi: { get: vi.fn() },
}))

const TOKEN = 'abcdefghijklmnopqrstuv'
const START = new Date('2026-01-01T10:00:00Z').getTime()
const FLIGHT_MS = 5000
const FAKE_TIMERS = ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] as const

function initial(timer: unknown = { mode: 'none' }) {
  return {
    type: 'matching' as const,
    matching: { title: 'Животные', showAnswers: true, version: 'v1', timer, definitions: ['Мяукает', 'Лает', 'Мычит'], terms: ['собака', 'кошка', 'корова'] },
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
  const wrapper = await mountSuspended(MatchingPlay, { props: { token: TOKEN, initial: response }, attachTo: document.body, global: { provide } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

// Стор живёт между тестами файла: без сброса доска прошлого теста монтируется до start() и забирает вылет
beforeEach(() => {
  vi.resetAllMocks()
  useMatchingPlayStore().status = 'loading'
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('MatchingPlay: вылет доски (тема кодом)', () => {
  it('вылетают лоток со словами и каждое определение по порядку', async () => {
    const { entrance, state } = fakeEntrance()
    await mountPlay(playerContext(entrance))

    expect(entrance.run).toHaveBeenCalledTimes(1)
    const classes = state.targets!.items.map((item) => item.className.split(' ')[0])
    expect(classes).toEqual(['matching-board__tray', 'definition-card', 'definition-card', 'definition-card'])
  })

  it('фокус на заголовке задания и перезапуск отсчёта — только после приземления', async () => {
    const store = useMatchingPlayStore()
    const restartClock = vi.spyOn(store, 'restartClock')
    const { entrance, state } = fakeEntrance()
    const wrapper = await mountPlay(playerContext(entrance))

    expect(document.activeElement).not.toBe(wrapper.get('.matching-board__task').element)
    expect(restartClock).not.toHaveBeenCalled()

    state.land()
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('.matching-board__task').element)
    expect(restartClock).toHaveBeenCalledTimes(1)
  })

  it('без проигрывателя как раньше: отсчёт не перезапускается, рамки нет', async () => {
    const store = useMatchingPlayStore()
    const restartClock = vi.spyOn(store, 'restartClock')
    const wrapper = await mountPlay(null)

    expect(restartClock).not.toHaveBeenCalled()
    expect(wrapper.find('.entrance-card--framed').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.matching-board__task').element)
  })

  it('секундомер идёт от приземления, а не от загрузки', async () => {
    vi.useFakeTimers({ toFake: [...FAKE_TIMERS] })
    vi.setSystemTime(START)
    const store = useMatchingPlayStore()
    const { entrance, state } = fakeEntrance()
    await mountPlay(playerContext(entrance), initial({ mode: 'stopwatch' }))
    // Пока доска вылетает, таймер стоит (ученик видит 0:00 или полный лимит)
    expect(store.startedAt).toBeNull()

    await vi.advanceTimersByTimeAsync(FLIGHT_MS)
    state.land()
    await flushPromises()
    expect(store.startedAt).toBe(START + FLIGHT_MS)
  })
})

describe('useMatchingPlayStore.restartClock', () => {
  it('до загрузки задания ничего не запускает, после — ставит отсчёт на текущий момент', async () => {
    vi.useFakeTimers({ toFake: [...FAKE_TIMERS] })
    vi.setSystemTime(START)
    const store = useMatchingPlayStore()
    store.startedAt = null
    store.restartClock()
    expect(store.startedAt).toBeNull()

    await store.start(TOKEN, initial())
    vi.setSystemTime(START + FLIGHT_MS)
    store.restartClock()
    expect(store.startedAt).toBe(START + FLIGHT_MS)
  })
})
