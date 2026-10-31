import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import { useOffscreenPause } from './useOffscreenPause'

let wrapper: VueWrapper
let isPaused: Ref<boolean>
let notifyObserver: (entries: Partial<IntersectionObserverEntry>[]) => void
let observedElements: Element[]
let isObserverDisconnected: boolean

async function mountScene({ hasTarget = true } = {}) {
  const Scene = defineComponent({
    setup() {
      const target = ref<HTMLElement | null>(null)
      isPaused = useOffscreenPause(target).isPaused
      return () => h('div', hasTarget ? { ref: target } : {})
    },
  })
  wrapper = await mountSuspended(Scene)
}

beforeEach(() => {
  observedElements = []
  isObserverDisconnected = false
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof notifyObserver) {
      notifyObserver = callback
    }

    observe(element: Element) {
      observedElements.push(element)
    }

    disconnect() {
      isObserverDisconnected = true
    }
  })
})

afterEach(() => {
  wrapper.unmount()
  vi.unstubAllGlobals()
})

describe('useOffscreenPause', () => {
  it('до первого уведомления не ставит на паузу и следит за элементом', async () => {
    await mountScene()

    expect(isPaused.value).toBe(false)
    expect(observedElements).toEqual([wrapper.element])
  })

  it('ставит на паузу за экраном и снимает паузу при возврате', async () => {
    await mountScene()

    notifyObserver([{ isIntersecting: false }])
    expect(isPaused.value).toBe(true)

    notifyObserver([{ isIntersecting: true }])
    expect(isPaused.value).toBe(false)
  })

  it('не меняет состояние на пустое уведомление', async () => {
    await mountScene()
    notifyObserver([{ isIntersecting: false }])

    notifyObserver([])

    expect(isPaused.value).toBe(true)
  })

  it('без элемента не создаёт наблюдателя', async () => {
    await mountScene({ hasTarget: false })

    expect(observedElements).toEqual([])
  })

  it('отключает наблюдателя при размонтировании', async () => {
    await mountScene()

    wrapper.unmount()

    expect(isObserverDisconnected).toBe(true)
  })
})
