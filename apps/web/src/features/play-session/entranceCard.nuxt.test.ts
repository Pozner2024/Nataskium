import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import type { IntroEntrance, IntroEntranceTargets, QuestionSwap } from '@/entities/intro-theme'
import { EntranceCard, PLAYER_ENTRANCE_KEY, type PlayerEntrance } from '@/features/play-session'

// Над карточкой — полоса прогресса задания: дорожка сигнала не должна на неё заходить
const Host = defineComponent({
  emits: ['landed'],
  setup(_props, { emit }) {
    return () => [
      h('progress', { class: 'bar' }),
      h(EntranceCard, { items: '.item', onLanded: (played: boolean) => emit('landed', played) }, () => [
        h('p', { class: 'item' }, 'вопрос'),
        h('button', { class: 'item' }, 'ответ'),
      ]),
    ]
  },
})

function context(entrance: IntroEntrance | null): PlayerEntrance {
  return { framed: true, take: () => entrance }
}

describe('EntranceCard', () => {
  it('без вылета сразу сообщает, что задание на месте', async () => {
    const wrapper = await mountSuspended(Host)
    await flushPromises()
    expect(wrapper.emitted('landed')).toEqual([[false]])
    expect(wrapper.find('.entrance-card--framed').exists()).toBe(false)
  })

  it('с вылетом: элементы по селектору, потолок дорожки — полоса над карточкой, landed(true) после приземления', async () => {
    let land = () => {}
    let received: IntroEntranceTargets | null = null
    const entrance: IntroEntrance = {
      run: vi.fn((targets: IntroEntranceTargets) => {
        received = targets
        targets.onReady()
        return new Promise<void>((resolve) => (land = resolve))
      }),
      cancel: vi.fn(),
    }
    const wrapper = await mountSuspended(Host, { global: { provide: { [PLAYER_ENTRANCE_KEY as symbol]: context(entrance) } } })
    await flushPromises()

    expect(wrapper.find('.entrance-card--framed').exists()).toBe(true)
    expect(wrapper.findAll('.entrance-card__dot')).toHaveLength(3)
    expect(received!.items.map((item) => item.textContent)).toEqual(['вопрос', 'ответ'])
    expect(received!.ceiling?.classList.contains('bar')).toBe(true)
    expect(wrapper.emitted('landed')).toBeUndefined()

    land()
    await flushPromises()
    expect(wrapper.emitted('landed')).toEqual([[true]])
    expect(wrapper.find('.entrance-card--entering').exists()).toBe(false)
  })

  it('реактивный swap и cancel: при смене темы берётся новый swap, при размонтировании активный swap отменяется', async () => {
    const firstSwap: QuestionSwap = { enter: vi.fn(() => new Promise<void>(() => {})), cancel: vi.fn() }
    const secondSwap: QuestionSwap = { enter: vi.fn(() => new Promise<void>(() => {})), cancel: vi.fn() }
    let currentSwap = firstSwap
    const framed = ref(true)
    const swapKey = ref(0)

    const SwapHost = defineComponent({
      setup() {
        return () => h(EntranceCard, { items: '.item', swapKey: swapKey.value }, () => [h('p', { class: 'item' }, 'вопрос')])
      },
    })

    const wrapper = await mountSuspended(SwapHost, {
      global: {
        provide: {
          [PLAYER_ENTRANCE_KEY as symbol]: {
            get framed() {
              return framed.value
            },
            take: () => null,
            swap: () => currentSwap,
          } satisfies PlayerEntrance,
        },
      },
    })
    await flushPromises()

    swapKey.value = 1
    await flushPromises()
    expect(firstSwap.enter).toHaveBeenCalledTimes(1)

    currentSwap = secondSwap
    framed.value = false
    swapKey.value = 2
    await flushPromises()
    expect(firstSwap.cancel).toHaveBeenCalledTimes(1)
    expect(secondSwap.enter).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.entrance-card--framed').exists()).toBe(false)

    wrapper.unmount()
    expect(secondSwap.cancel).toHaveBeenCalledTimes(1)
  })
})
