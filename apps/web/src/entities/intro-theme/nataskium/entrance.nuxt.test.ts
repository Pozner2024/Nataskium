import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { IntroEntranceTargets, IntroSound } from '../types'
import { loadGsap } from '../loadGsap'
import { createNataskiumEntrance } from './entrance'

vi.mock('../loadGsap', async (importOriginal) => {
  const original = await importOriginal<typeof import('../loadGsap')>()
  return { loadGsap: vi.fn(original.loadGsap) }
})

const STAGE_SIZE = { left: 0, top: 0, width: 1440, height: 810, right: 1440, bottom: 810 }
const ROUTE_LENGTH = 600
// Вылет занимает больше 3 с: быстрый выход значит, что сработал путь отказа, а не таймлайн до конца
const FAILURE_PATH_MAX_MS = 500

// Разметка как у вопроса в проигрывателе: полоса прогресса, под ней карточка с точками окна и элементами
function setup() {
  const stage = document.createElement('div')
  const bar = document.createElement('progress')
  const card = document.createElement('div')
  const dots = document.createElement('span')
  const items = ['вопрос', 'a', 'b'].map((text) => {
    const item = document.createElement('button')
    item.textContent = text
    return item
  })
  card.append(dots, ...items)
  stage.append(bar, card)
  document.body.append(stage)
  const onReady = vi.fn()
  const targets: IntroEntranceTargets = { card, dots, items, ceiling: bar, onReady }
  return { stage, card, items, targets, onReady }
}

function fakeSound(): IntroSound & { played: string[] } {
  const played: string[] = []
  return { played, unlock: vi.fn(), play: (name) => played.push(name), setMuted: vi.fn(), stop: vi.fn(), dispose: vi.fn() }
}

const totalLength = vi.fn(() => ROUTE_LENGTH)
const ORIGINAL_TOTAL_LENGTH = Object.getOwnPropertyDescriptor(SVGPathElement.prototype, 'getTotalLength')

describe('createNataskiumEntrance: вылет первого вопроса на GSAP', () => {
  // В проигрывателе GSAP уже загружен сценой интро
  beforeAll(async () => {
    await loadGsap()
  })

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...STAGE_SIZE } as DOMRect)
    // В happy-dom у SVG нет настоящей геометрии: длина дорожки задаётся вручную
    Object.defineProperty(SVGPathElement.prototype, 'getTotalLength', { configurable: true, value: totalLength })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(SVGPathElement.prototype, 'getTotalLength')
    if (ORIGINAL_TOTAL_LENGTH) Object.defineProperty(SVGPathElement.prototype, 'getTotalLength', ORIGINAL_TOTAL_LENGTH)
    document.body.innerHTML = ''
  })

  it('во время вылета варианты нельзя нажать, дорожка и рамка нарисованы и скрыты от скринридера', async () => {
    const { stage, card, items, targets, onReady } = setup()
    const entrance = createNataskiumEntrance(stage, 'dark', null)
    const running = entrance.run(targets)
    await flushPromises()

    expect(items.every((item) => item.inert)).toBe(true)
    expect(onReady).toHaveBeenCalled()
    expect(totalLength).toHaveBeenCalled()
    const route = stage.querySelector(':scope > svg')
    expect(route?.getAttribute('aria-hidden')).toBe('true')
    expect(card.querySelector(':scope > svg')?.getAttribute('aria-hidden')).toBe('true')

    entrance.cancel()
    await running
  })

  it('cancel (размонтирование) сразу даёт конечное состояние: варианты видны и нажимаются, слои сигнала убраны', async () => {
    const { stage, card, items, targets } = setup()
    const entrance = createNataskiumEntrance(stage, 'light', null)
    const running = entrance.run(targets)
    await flushPromises()

    entrance.cancel()
    await running
    expect(items.every((item) => !item.inert)).toBe(true)
    expect(stage.querySelector('svg')).toBeNull()
    expect(items.every((item) => item.style.opacity === '' || item.style.opacity === '1')).toBe(true)
    expect(card.style.transform === '' || !card.style.transform.includes('0.86')).toBe(true)
  })

  it('звуки по событиям вылета: сигнал, рамка и по одному на каждый элемент', async () => {
    const { stage, targets } = setup()
    const sound = fakeSound()
    const entrance = createNataskiumEntrance(stage, 'dark', sound)
    const running = entrance.run(targets)
    await flushPromises()
    entrance.cancel()
    await running

    expect(sound.played).toEqual(['signal', 'frame', 'answer', 'answer', 'answer'])
  })

  it('GSAP не загрузился: сразу конечное состояние без анимации', async () => {
    vi.mocked(loadGsap).mockRejectedValueOnce(new Error('chunk failed'))
    const { stage, items, targets, onReady } = setup()
    await createNataskiumEntrance(stage, 'dark', null).run(targets)

    expect(onReady).toHaveBeenCalled()
    expect(items.every((item) => !item.inert)).toBe(true)
    expect(stage.querySelector('svg')).toBeNull()
  })

  it('сбой посреди подготовки (нет геометрии SVG) не оставляет варианты невидимыми', async () => {
    const broken = vi.fn(() => {
      throw new Error('no geometry')
    })
    Object.defineProperty(SVGPathElement.prototype, 'getTotalLength', { configurable: true, value: broken })
    const { stage, card, items, targets } = setup()
    const startedAt = performance.now()
    await createNataskiumEntrance(stage, 'dark', null).run(targets)

    expect(broken).toHaveBeenCalled()
    expect(performance.now() - startedAt).toBeLessThan(FAILURE_PATH_MAX_MS)
    expect(items.every((item) => !item.inert)).toBe(true)
    expect(items.map((item) => item.style.opacity)).toEqual(['', '', ''])
    expect(card.style.transform).toBe('')
    expect(stage.querySelector('svg')).toBeNull()
  })
})
