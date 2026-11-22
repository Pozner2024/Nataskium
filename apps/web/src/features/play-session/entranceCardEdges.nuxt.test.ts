import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { IntroEntrance, IntroEntranceTargets } from '@/entities/intro-theme'
import { EntranceCard, PLAYER_ENTRANCE_KEY, type PlayerEntrance } from '@/features/play-session'

const Host = defineComponent({
  emits: ['landed'],
  setup(_props, { emit }) {
    return () => h(EntranceCard, { items: '.item', onLanded: (played: boolean) => emit('landed', played) }, () => [h('button', { class: 'item' }, 'ответ')])
  },
})

function mountHost(context: PlayerEntrance) {
  return mountSuspended(Host, { global: { provide: { [PLAYER_ENTRANCE_KEY as symbol]: context } } })
}

describe('EntranceCard: края договора с проигрывателем', () => {
  it('до готовности вылета карточку не видно, после onReady — видно', async () => {
    let ready = () => {}
    const entrance: IntroEntrance = {
      run: vi.fn((targets: IntroEntranceTargets) => {
        ready = targets.onReady
        return new Promise<void>(() => {})
      }),
      cancel: vi.fn(),
    }
    const wrapper = await mountHost({ framed: true, take: () => entrance })
    await flushPromises()
    expect(wrapper.find('.entrance-card--waiting').exists()).toBe(true)

    ready()
    await flushPromises()
    expect(wrapper.find('.entrance-card--waiting').exists()).toBe(false)
  })

  it('рамка темы без вылета (второй вопрос): точки окна есть, landed(false) сразу', async () => {
    const wrapper = await mountHost({ framed: true, take: () => null })
    await flushPromises()
    expect(wrapper.find('.entrance-card--framed').exists()).toBe(true)
    expect(wrapper.find('.entrance-card--entering').exists()).toBe(false)
    expect(wrapper.find('.entrance-card--waiting').exists()).toBe(false)
    expect(wrapper.emitted('landed')).toEqual([[false]])
  })

  it('размонтирование посреди вылета вызывает cancel ровно один раз', async () => {
    const entrance: IntroEntrance = { run: vi.fn(() => new Promise<void>(() => {})), cancel: vi.fn() }
    const wrapper = await mountHost({ framed: true, take: () => entrance })
    await flushPromises()
    wrapper.unmount()
    expect(entrance.cancel).toHaveBeenCalledTimes(1)
  })
})
