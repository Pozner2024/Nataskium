import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NatStudents } from '@/shared'

// Дольше задержки ответа, но короче вспышки антенны: срабатывает отложенная вспышка и ставит свой таймер
const PING_ACTIVE_AT_MS = 1750

let wrapper: VueWrapper

function stubBrowserApis() {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}

    disconnect() {}
  })
  vi.stubGlobal('AudioContext', class {
    currentTime = 0
    destination = {}

    close() {
      return Promise.resolve()
    }

    createOscillator() {
      const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }
      return { frequency: param, connect: (node: object) => node, start() {}, stop() {} }
    }

    createBiquadFilter() {
      return { frequency: {}, connect: (node: object) => node }
    }

    createGain() {
      const param = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }
      return { gain: param, connect: (node: object) => node }
    }
  })
}

afterEach(() => {
  wrapper.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('NatStudents', () => {
  it('при размонтировании не оставляет таймеров после нажатия', async () => {
    stubBrowserApis()
    wrapper = await mountSuspended(NatStudents)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await wrapper.find('.nat-students').trigger('click')
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    wrapper.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('при размонтировании снимает таймер уже начавшейся вспышки антенны', async () => {
    stubBrowserApis()
    wrapper = await mountSuspended(NatStudents)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await wrapper.find('.nat-students').trigger('click')
    vi.advanceTimersByTime(PING_ACTIVE_AT_MS)
    expect(wrapper.find('.nat-students__seat--ping').exists()).toBe(true)

    wrapper.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
