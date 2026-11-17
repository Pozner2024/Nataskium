import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { defineComponent, nextTick, ref, type Ref } from 'vue'
import type { QuizTimer } from '@nataskium/shared/schemas'
import { type PlayTimerView, usePlayTimer } from './usePlayTimer'

const START = new Date('2026-01-01T10:00:00Z').getTime()
const SECOND = 1000

let view: PlayTimerView
const mounted: { unmount: () => void }[] = []

type Source = {
  timer: Ref<QuizTimer>
  startedAt: Ref<number | null>
  elapsedSeconds: Ref<number | null>
  timedOut: Ref<boolean>
  isFinished: Ref<boolean>
  expire: Mock<() => void>
}

// Как в сторе: до старта startedAt = null, метка появляется после загрузки вопросов
function makeSource(timer: QuizTimer, overrides: Partial<Source> = {}): Source {
  return {
    timer: ref<QuizTimer>(timer),
    startedAt: ref<number | null>(null),
    elapsedSeconds: ref<number | null>(null),
    timedOut: ref(false),
    isFinished: ref(false),
    expire: vi.fn<() => void>(),
    ...overrides,
  }
}

async function mountWith(source: Source): Promise<void> {
  const Harness = defineComponent({
    setup() {
      view = usePlayTimer(source)
      return () => null
    },
  })
  mounted.push(await mountSuspended(Harness))
}

// Старт после монтирования — порядок, в котором стор выставляет startedAt
async function mountRunning(source: Source): Promise<void> {
  await mountWith(source)
  source.startedAt.value = START
  await nextTick()
}

async function advance(seconds: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(seconds * SECOND)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(START)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
})

describe('usePlayTimer: источник без таймера и без старта', () => {
  it('режим none: остатка нет, отсчёт не идёт, expire не вызывается', async () => {
    const source = makeSource({ mode: 'none' })
    await mountRunning(source)

    await advance(3600)

    expect(view.remainingSeconds.value).toBeNull()
    expect(view.isLow.value).toBe(false)
    expect(source.expire).not.toHaveBeenCalled()
  })

  it('startedAt = null: прошедшее время 0, остаток равен лимиту, отсчёт не идёт', async () => {
    const source = makeSource({ mode: 'limit', seconds: 60 })
    await mountWith(source)

    await advance(120)

    expect(view.elapsedSeconds.value).toBe(0)
    expect(view.remainingSeconds.value).toBe(60)
    expect(source.expire).not.toHaveBeenCalled()
  })
})

describe('usePlayTimer: остановка и граница', () => {
  it('isFinished = true останавливает отсчёт: после результата expire не вызывается', async () => {
    const source = makeSource({ mode: 'limit', seconds: 60 })
    await mountRunning(source)

    await advance(30)
    source.isFinished.value = true
    await advance(60)

    expect(source.expire).not.toHaveBeenCalled()
  })

  it('expire вызывается один раз на границе: источник после истечения ставит timedOut', async () => {
    const source = makeSource({ mode: 'limit', seconds: 60 })
    source.expire.mockImplementation(() => {
      source.timedOut.value = true
    })
    await mountRunning(source)

    await advance(59)
    expect(source.expire).not.toHaveBeenCalled()
    await advance(1)
    expect(source.expire).toHaveBeenCalledTimes(1)

    await advance(120)
    expect(source.expire).toHaveBeenCalledTimes(1)
  })

  it('timedOut = true останавливает отсчёт до границы', async () => {
    const source = makeSource({ mode: 'limit', seconds: 60 })
    await mountRunning(source)

    await advance(10)
    source.timedOut.value = true
    await advance(100)

    expect(source.expire).not.toHaveBeenCalled()
  })

  // Фиксирует контракт: таймер создан уже у запущенного источника (startedAt задан до монтирования).
  // Сейчас watch в usePlayTimer не immediate, и отсчёт не стартует — тест падает
  it('источник уже запущен при создании таймера: отсчёт идёт', async () => {
    const source = makeSource({ mode: 'limit', seconds: 60 }, { startedAt: ref<number | null>(START) })
    await mountWith(source)

    await advance(10)

    expect(view.remainingSeconds.value).toBe(50)
  })
})

describe('usePlayTimer: пороги и объявления', () => {
  it('низкое время: при 25 % лимита, но не больше 60 секунд', async () => {
    const source = makeSource({ mode: 'limit', seconds: 600 })
    await mountRunning(source)

    await advance(539)
    expect(view.remainingSeconds.value).toBe(61)
    expect(view.isLow.value).toBe(false)

    await advance(1)
    expect(view.remainingSeconds.value).toBe(60)
    expect(view.isLow.value).toBe(true)
  })

  it('низкое время для короткого лимита: порог 25 % от 120 секунд — 30', async () => {
    const source = makeSource({ mode: 'limit', seconds: 120 })
    await mountRunning(source)

    await advance(89)
    expect(view.isLow.value).toBe(false)
    await advance(1)
    expect(view.remainingSeconds.value).toBe(30)
    expect(view.isLow.value).toBe(true)
  })

  it('объявление при низком времени появляется, при истечении — заменяется на «время вышло»', async () => {
    const source = makeSource({ mode: 'limit', seconds: 60 })
    source.expire.mockImplementation(() => {
      source.timedOut.value = true
    })
    await mountRunning(source)

    await advance(45)
    expect(view.announcement.value).not.toBe('')
    const lowText = view.announcement.value

    await advance(15)
    expect(view.announcement.value).not.toBe('')
    expect(view.announcement.value).not.toBe(lowText)
  })
})

describe('usePlayTimer: прошедшее время', () => {
  it('elapsedSeconds из источника (зафиксирован после результата) имеет приоритет над живым счётчиком', async () => {
    const source = makeSource({ mode: 'stopwatch' }, { elapsedSeconds: ref<number | null>(222) })
    await mountRunning(source)

    await advance(10)

    expect(view.elapsedSeconds.value).toBe(222)
  })

  it('секундомер: живой счётчик растёт, остатка нет', async () => {
    const source = makeSource({ mode: 'stopwatch' })
    await mountRunning(source)

    await advance(5)

    expect(view.elapsedSeconds.value).toBe(5)
    expect(view.remainingSeconds.value).toBeNull()
  })
})
