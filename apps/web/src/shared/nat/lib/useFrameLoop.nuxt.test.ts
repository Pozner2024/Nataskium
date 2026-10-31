import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useFrameLoop } from './useFrameLoop'

// Шаг больше MIN_FRAME_MS, чтобы цикл не пропускал такты
const FRAME_STEP_MS = 20

let wrapper: VueWrapper
let onFrame: ReturnType<typeof vi.fn<(dt: number) => void>>
let clock: number
let scheduledFrames: Map<number, FrameRequestCallback>
let nextFrameId: number
let notifyObserver: (isIntersecting: boolean) => void
let isObserverDisconnected: boolean

function stubBrowserApis(isReducedMotion: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: isReducedMotion }))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrameId += 1
    scheduledFrames.set(nextFrameId, callback)
    return nextFrameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => scheduledFrames.delete(id))
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
      notifyObserver = isIntersecting => callback([{ isIntersecting }])
    }

    observe() {}

    disconnect() {
      isObserverDisconnected = true
    }
  })
}

async function mountLoop({ isReducedMotion = false, isAlwaysOn = false } = {}) {
  stubBrowserApis(isReducedMotion)
  const Scene = defineComponent({
    setup() {
      useFrameLoop(onFrame, { isAlwaysOn })
      return () => h('div')
    },
  })
  wrapper = await mountSuspended(Scene)
}

function runFrame() {
  clock += FRAME_STEP_MS
  const frames = [...scheduledFrames.values()]
  scheduledFrames.clear()
  frames.forEach(frame => frame(clock))
}

function runFrames(count: number) {
  for (let i = 0; i < count; i += 1) runFrame()
}

beforeEach(() => {
  onFrame = vi.fn<(dt: number) => void>()
  clock = 0
  scheduledFrames = new Map()
  nextFrameId = 0
  isObserverDisconnected = false
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  wrapper.unmount()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useFrameLoop', () => {
  describe('reduced motion', () => {
    it('сцена за экраном при монтировании не рисуется, пока не вернётся на экран', async () => {
      await mountLoop({ isReducedMotion: true })
      notifyObserver(false)
      runFrames(3)

      expect(onFrame).not.toHaveBeenCalled()
    })

    it('после возврата на экран рисует ровно один кадр и не запускает цикл', async () => {
      await mountLoop({ isReducedMotion: true })
      notifyObserver(false)
      notifyObserver(true)
      runFrames(3)

      expect(onFrame).toHaveBeenCalledOnce()
      expect(scheduledFrames.size).toBe(0)
    })

    it('сцена на экране при монтировании рисует один кадр', async () => {
      await mountLoop({ isReducedMotion: true })
      notifyObserver(true)
      runFrames(3)

      expect(onFrame).toHaveBeenCalledOnce()
      expect(scheduledFrames.size).toBe(0)
    })

    it('если такт пришёл раньше уведомления наблюдателя, сцена отрисована и цикл не запущен', async () => {
      await mountLoop({ isReducedMotion: true })
      runFrame()
      notifyObserver(true)
      runFrames(3)

      expect(onFrame).toHaveBeenCalled()
      expect(scheduledFrames.size).toBe(0)
    })
  })

  describe('цикл', () => {
    it('рисует кадр на каждый такт, пока сцена на экране', async () => {
      await mountLoop()
      notifyObserver(true)
      runFrames(3)

      expect(onFrame).toHaveBeenCalledTimes(3)
    })

    it('после ухода с экрана новых кадров нет', async () => {
      await mountLoop()
      notifyObserver(true)
      runFrames(2)
      notifyObserver(false)
      runFrames(3)

      expect(onFrame).toHaveBeenCalledTimes(2)
      expect(scheduledFrames.size).toBe(0)
    })

    it('при возврате на экран запускается снова', async () => {
      await mountLoop()
      notifyObserver(false)
      notifyObserver(true)
      runFrames(3)

      expect(onFrame).toHaveBeenCalledTimes(3)
    })

    it('с isAlwaysOn при reduced motion при возврате на экран запускается снова', async () => {
      await mountLoop({ isReducedMotion: true, isAlwaysOn: true })
      notifyObserver(false)
      notifyObserver(true)
      runFrames(3)

      expect(onFrame).toHaveBeenCalledTimes(3)
    })
  })

  it('при размонтировании отменяет кадр и отключает наблюдателя', async () => {
    await mountLoop()
    wrapper.unmount()

    expect(scheduledFrames.size).toBe(0)
    expect(isObserverDisconnected).toBe(true)
  })
})
