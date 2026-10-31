import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { NatCards } from '@/shared'

const CARDS_COUNT = 6
const FRAME_STEP_MS = 20
const GREETING_MS = 4500
const MAX_FRAMES = 1000

let wrapper: VueWrapper
let clock: number
let scheduledFrames: Map<number, FrameRequestCallback>
let nextFrameId: number

function stubBrowserApis(isReducedMotion: boolean) {
  clock = 0
  scheduledFrames = new Map()
  nextFrameId = 0
  vi.stubGlobal('matchMedia', () => ({ matches: isReducedMotion }))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrameId += 1
    scheduledFrames.set(nextFrameId, callback)
    return nextFrameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => scheduledFrames.delete(id))
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}

    disconnect() {}
  })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
}

async function mountCards({ isReducedMotion = true } = {}) {
  stubBrowserApis(isReducedMotion)
  wrapper = await mountSuspended(NatCards)
  // Таймеры подменяем после монтирования: mountSuspended сам ждёт настоящие
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
}

async function runFrame() {
  clock += FRAME_STEP_MS
  const frames = [...scheduledFrames.values()]
  scheduledFrames.clear()
  frames.forEach(frame => frame(clock))
  await nextTick()
}

function cardsCount() {
  return wrapper.findAll('[data-testid="nat-card"]').length
}

function isGreetingVisible() {
  return wrapper.find('.nat-cards__bubble').classes().includes('nat-cards__bubble--visible')
}

async function press() {
  await wrapper.find('.nat-robot').trigger('click')
  await runFrame()
}

async function waitMs(ms: number) {
  vi.advanceTimersByTime(ms)
  await runFrame()
}

afterEach(() => {
  wrapper.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('NatCards', () => {
  it('кнопка сцены подписана для скринридера', async () => {
    await mountCards()

    expect(wrapper.find('.nat-robot').attributes('aria-label')).toContain('Нат собирает задание')
  })

  describe('при reduced motion', () => {
    it('сразу показывает собранное задание', async () => {
      await mountCards()
      await runFrame()

      expect(cardsCount()).toBe(CARDS_COUNT)
    })

    it('по нажатию прячет карточки и показывает приветствие', async () => {
      await mountCards()
      await runFrame()
      await press()

      expect(isGreetingVisible()).toBe(true)
      expect(cardsCount()).toBe(0)
    })

    it('после приветствия возвращает карточки', async () => {
      await mountCards()
      await runFrame()
      await press()
      await waitMs(GREETING_MS)

      expect(isGreetingVisible()).toBe(false)
      expect(cardsCount()).toBe(CARDS_COUNT)
    })

    it('повторное нажатие продлевает приветствие', async () => {
      await mountCards()
      await runFrame()
      await press()
      await waitMs(GREETING_MS - 1)
      await press()
      await waitMs(GREETING_MS - 1)

      expect(isGreetingVisible()).toBe(true)
    })

    it('при размонтировании снимает таймер приветствия', async () => {
      await mountCards()
      await runFrame()
      await press()
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      wrapper.unmount()

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('с анимацией', () => {
    it('сначала карточек нет, потом собираются все шесть', async () => {
      await mountCards({ isReducedMotion: false })
      expect(cardsCount()).toBe(0)

      for (let frame = 0; frame < MAX_FRAMES && cardsCount() < CARDS_COUNT; frame += 1) await runFrame()

      expect(cardsCount()).toBe(CARDS_COUNT)
    })
  })
})
