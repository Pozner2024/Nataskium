import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { loadGsap } from '../loadGsap'
import NataskiumScene from './NataskiumScene.vue'

vi.mock('../loadGsap', () => ({ loadGsap: vi.fn() }))

const SCENE_SIZE = { width: 1440, height: 810 }

// Подмена GSAP: проверяется договор сцены (play/skip/clean/revert), а не само движение
type FakeGsapState = { onComplete: (() => void) | null; reverted: number }

function fakeGsap(state: FakeGsapState) {
  const timeline = {
    fromTo: () => timeline,
    to: () => timeline,
    addLabel: () => timeline,
    call: () => timeline,
    play: () => timeline,
    eventCallback: (_event: string, callback: () => void) => {
      state.onComplete = callback
      return timeline
    },
    progress: () => {
      state.onComplete?.()
      return timeline
    },
  }
  return {
    set: () => undefined,
    timeline: () => timeline,
    parseEase: () => (progress: number) => progress,
    context: (build: () => void) => {
      build()
      return { revert: () => state.reverted++ }
    },
  }
}

function prefersReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reduce } as MediaQueryList)
}

describe('NataskiumScene: интро', () => {
  let state: FakeGsapState

  beforeEach(() => {
    state = { onComplete: null, reverted: 0 }
    vi.mocked(loadGsap).mockResolvedValue(fakeGsap(state) as unknown as Awaited<ReturnType<typeof loadGsap>>)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...SCENE_SIZE } as DOMRect)
    prefersReducedMotion(false)
  })

  afterEach(() => vi.restoreAllMocks())

  it('play показывает лого и резолвится на чистой сцене, когда таймлайн закончился', async () => {
    const wrapper = await mountSuspended(NataskiumScene, { props: { tone: 'dark' } })
    let done = false
    const playing = wrapper.vm.play().then(() => (done = true))
    await flushPromises()
    expect(wrapper.find('.nataskium-scene__logo').exists()).toBe(true)
    expect(done).toBe(false)

    state.onComplete?.()
    await playing
    await flushPromises()
    expect(wrapper.find('.nataskium-scene__logo').exists()).toBe(false)
    expect(wrapper.emitted('clean')).toHaveLength(1)
    expect(state.reverted).toBe(1)
  })

  it('живого фона в сцене нет: он живёт в проигрывателе, отдельным слоем', async () => {
    const wrapper = await mountSuspended(NataskiumScene, { props: { tone: 'dark' } })
    const playing = wrapper.vm.play()
    await flushPromises()
    wrapper.vm.skip()
    await playing
    await flushPromises()
    expect(wrapper.find('.nataskium-ambience').exists()).toBe(false)
    expect(wrapper.find('.ambient-signals').exists()).toBe(false)
    expect(wrapper.find('.blinking-pads').exists()).toBe(false)
  })

  it('skip сразу приводит к чистой сцене', async () => {
    const wrapper = await mountSuspended(NataskiumScene, { props: { tone: 'dark' } })
    const playing = wrapper.vm.play()
    await flushPromises()
    wrapper.vm.skip()
    await playing
    await flushPromises()
    expect(wrapper.find('.nataskium-scene__logo').exists()).toBe(false)
    expect(wrapper.emitted('clean')).toHaveLength(1)
  })

  it('размонтирование посреди интро снимает анимацию и не оставляет play висеть', async () => {
    const wrapper = await mountSuspended(NataskiumScene, { props: { tone: 'dark' } })
    const playing = wrapper.vm.play()
    await flushPromises()
    wrapper.unmount()
    await playing
    expect(state.reverted).toBe(1)
  })

  it('если GSAP не загрузился, сразу чистая сцена', async () => {
    vi.mocked(loadGsap).mockRejectedValue(new Error('chunk failed'))
    const wrapper = await mountSuspended(NataskiumScene, { props: { tone: 'dark' } })
    await wrapper.vm.play()
    await flushPromises()
    expect(wrapper.find('.nataskium-scene__logo').exists()).toBe(false)
    expect(wrapper.emitted('clean')).toHaveLength(1)
  })

  it('при prefers-reduced-motion интро не играет и GSAP не грузится', async () => {
    prefersReducedMotion(true)
    const wrapper = await mountSuspended(NataskiumScene, { props: { tone: 'dark' } })
    await wrapper.vm.play()
    expect(loadGsap).not.toHaveBeenCalled()
    expect(wrapper.emitted('clean')).toHaveLength(1)
  })

  it('кадр с собранным лого для проверки показывает все буквы и обводки', async () => {
    const wrapper = await mountSuspended(NataskiumScene, { props: { tone: 'light', state: 'assembled' } })
    await flushPromises()
    expect(wrapper.find('.nataskium-scene').classes()).toContain('nataskium-scene--light')
    expect(wrapper.findAll('.nataskium-scene__outline')).toHaveLength(8)
    expect(wrapper.findAll('.nataskium-scene__eye')).toHaveLength(2)
  })
})
