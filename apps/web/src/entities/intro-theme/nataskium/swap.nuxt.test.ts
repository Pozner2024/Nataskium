import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { loadGsap } from '../loadGsap'
import { createSlideSwap } from '../entrances/slideSwap'
import { createNataskiumSwap } from './swap'

vi.mock('../loadGsap', async (importOriginal) => {
  const original = await importOriginal<typeof import('../loadGsap')>()
  return { loadGsap: vi.fn(original.loadGsap) }
})

const CARD_SIZE = { left: 0, top: 0, width: 640, height: 360, right: 640, bottom: 360 }

function makeTargets() {
  const card = document.createElement('div')
  const items = ['вопрос', 'ответ'].map((text) => {
    const el = document.createElement('button')
    el.textContent = text
    card.append(el)
    return el
  })
  document.body.append(card)
  return { card, items }
}

describe('createNataskiumSwap: отмена и конкурентные клики', () => {
  beforeAll(async () => {
    await loadGsap()
  })

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...CARD_SIZE } as DOMRect)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('повторный enter() отменяет предыдущий импульс: в карточке максимум одна рамка SVG, cancel убирает её', async () => {
    const targets = makeTargets()
    const swap = createNataskiumSwap('dark', null)

    const first = swap.enter(targets)
    await flushPromises()
    expect(targets.card.querySelectorAll(':scope > svg')).toHaveLength(1)

    const second = swap.enter(targets)
    await first
    await flushPromises()
    expect(targets.card.querySelectorAll(':scope > svg')).toHaveLength(1)

    swap.cancel()
    await second
    expect(targets.card.querySelectorAll(':scope > svg')).toHaveLength(0)
  })

  it('cancel() во время загрузки GSAP не рисует рамку после резолва', async () => {
    let resolveGsap!: (gsap: Awaited<ReturnType<typeof loadGsap>>) => void
    const realGsap = await loadGsap()
    vi.mocked(loadGsap).mockReturnValueOnce(new Promise((resolve) => { resolveGsap = resolve }))

    const targets = makeTargets()
    const swap = createNataskiumSwap('light', null)

    const running = swap.enter(targets)
    swap.cancel()
    resolveGsap(realGsap)
    await running

    expect(targets.card.querySelectorAll(':scope > svg')).toHaveLength(0)
  })
})

describe('createSlideSwap: cancel', () => {
  it('отменяет активную Web Animation', async () => {
    const card = document.createElement('div')
    let rejectFinished!: () => void
    const cancel = vi.fn(() => rejectFinished())
    card.animate = vi.fn(() => ({
      cancel,
      finished: new Promise<void>((_resolve, reject) => { rejectFinished = reject }),
    }) as unknown as Animation)

    const swap = createSlideSwap(false)
    const running = swap.enter({ card, items: [] })
    swap.cancel()
    await running

    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
