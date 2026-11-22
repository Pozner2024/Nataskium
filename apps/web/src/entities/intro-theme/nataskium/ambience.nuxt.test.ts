import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IntroThemeAmbience from '../IntroThemeAmbience.vue'
import AmbientSignals from './AmbientSignals.vue'
import BlinkingPads from './BlinkingPads.vue'
import NataskiumAmbience from './NataskiumAmbience.vue'
import { ambientRoutes } from './layout'

const MAX_PADS = 12
const SIZES: Array<[string, number, number]> = [
  ['ноутбук', 1280, 720],
  ['16:9', 1920, 1080],
  ['телефон 390', 390, 844],
  ['маленький', 200, 150],
]

const mounted: { unmount: () => void }[] = []

async function mount<T>(component: T, props: Record<string, unknown>) {
  const wrapper = await mountSuspended(component as never, { props: props as never })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

// Площадки — HTML-точки: координаты в left/top
function padPoints(wrapper: { findAll: (selector: string) => { element: Element }[] }) {
  return wrapper.findAll('.blinking-pads__pad').map((pad) => {
    const { style } = pad.element as HTMLElement
    return { x: parseFloat(style.left), y: parseFloat(style.top) }
  })
}

function containerSize(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) })
}

// happy-dom при cancel() отклоняет animation.finished, и vitest считает это ошибкой; браузер так не делает.
// Тестам нужны только аргументы animate, сама анимация — нет
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(() => ({ cancel: vi.fn() }) as unknown as Animation)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('BlinkingPads', () => {
  it.each(SIZES)('%s: не больше 12 площадок, все внутри контейнера', async (_name, width, height) => {
    const wrapper = await mount(BlinkingPads, { width, height, tone: 'dark' })
    const pads = padPoints(wrapper)
    expect(pads.length).toBeLessThanOrEqual(MAX_PADS)
    for (const { x, y } of pads) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(height)
    }
  })

  it('на обычном экране мигает ровно 12 площадок, без повторов', async () => {
    const wrapper = await mount(BlinkingPads, { width: 1280, height: 720, tone: 'dark' })
    const points = padPoints(wrapper).map(({ x, y }) => `${x},${y}`)
    expect(points).toHaveLength(MAX_PADS)
    expect(new Set(points).size).toBe(MAX_PADS)
  })

  it('площадки в углах с узором (правый верхний и левый нижний), не в центре под карточкой', async () => {
    const width = 1280
    const height = 720
    const wrapper = await mount(BlinkingPads, { width, height, tone: 'dark' })
    for (const { x, y } of padPoints(wrapper)) {
      const topRight = x > width / 2 && y < height / 2
      const bottomLeft = x < width / 2 && y > height / 2
      expect(topRight || bottomLeft).toBe(true)
    }
  })

  it('выбор площадок одинаков при каждом показе', async () => {
    const first = await mount(BlinkingPads, { width: 1280, height: 720, tone: 'dark' })
    const second = await mount(BlinkingPads, { width: 1280, height: 720, tone: 'dark' })
    expect(second.html()).toBe(first.html())
  })

  it('цвета: неон на тёмном тоне, насыщенные на светлом; три цвета по кругу', async () => {
    const dark = await mount(BlinkingPads, { width: 1280, height: 720, tone: 'dark' })
    const light = await mount(BlinkingPads, { width: 1280, height: 720, tone: 'light' })
    const fills = (wrapper: typeof dark) => wrapper.findAll('.blinking-pads__pad').map((pad) => (pad.element as HTMLElement).style.background)
    expect(new Set(fills(dark)).size).toBe(3)
    expect(fills(dark)[0]).not.toBe(fills(light)[0])
    expect(fills(dark)[3]).toBe(fills(dark)[0])
  })

  it('скрыт от скринридера', async () => {
    const wrapper = await mount(BlinkingPads, { width: 1280, height: 720, tone: 'dark' })
    expect(wrapper.get('.blinking-pads').attributes('aria-hidden')).toBe('true')
  })
})

describe('AmbientSignals', () => {
  it('четыре дорожки по ambientRoutes, площадка в конце каждой; импульсы по очереди', async () => {
    const width = 1280
    const height = 720
    const animate = vi.spyOn(HTMLElement.prototype, 'animate')
    const wrapper = await mount(AmbientSignals, { width, height, tone: 'dark' })
    const routes = ambientRoutes(width, height)
    const groups = wrapper.findAll('g')
    expect(groups).toHaveLength(4)
    for (const [index, group] of groups.entries()) {
      const route = routes[index]!
      const end = route[route.length - 1]!
      expect(group.get('.ambient-signals__trace').attributes('d')).toBe(route.map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '))
      expect(Number(group.get('.ambient-signals__pad').attributes('cx'))).toBe(end.x)
      expect(Number(group.get('.ambient-signals__pad').attributes('cy'))).toBe(end.y)
    }
    // У каждой дорожки импульс и вспышка с одной задержкой: четыре разные, первая без задержки
    const delays = animate.mock.calls.map(([, options]) => (options as KeyframeAnimationOptions).delay)
    expect(delays).toHaveLength(8)
    expect(new Set(delays).size).toBe(4)
    expect(delays[0]).toBe(0)
  })

  it('скрыт от скринридера', async () => {
    const wrapper = await mount(AmbientSignals, { width: 1280, height: 720, tone: 'light' })
    expect(wrapper.get('.ambient-signals').attributes('aria-hidden')).toBe('true')
  })
})

describe('NataskiumAmbience', () => {
  it('у контейнера есть размер: блик, площадки и импульсы; тон в классе', async () => {
    containerSize(1280, 720)
    const wrapper = await mount(NataskiumAmbience, { tone: 'light' })
    expect(wrapper.get('.nataskium-ambience').classes()).toContain('nataskium-ambience--light')
    expect(wrapper.get('.nataskium-ambience').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.nataskium-ambience__glint').exists()).toBe(true)
    expect(wrapper.find('.blinking-pads').exists()).toBe(true)
    expect(wrapper.find('.ambient-signals').exists()).toBe(true)
    expect(wrapper.get('.ambient-signals__board').attributes('viewBox')).toBe('0 0 1280 720')
  })

  it('при размонтировании анимации импульсов отменяются', async () => {
    containerSize(1280, 720)
    const cancel = vi.fn()
    vi.mocked(HTMLElement.prototype.animate).mockImplementation(() => ({ cancel }) as unknown as Animation)
    const wrapper = await mount(NataskiumAmbience, { tone: 'dark' })
    expect(HTMLElement.prototype.animate).toHaveBeenCalled()
    mounted.splice(mounted.indexOf(wrapper), 1)
    wrapper.unmount()
    expect(cancel).toHaveBeenCalledTimes(vi.mocked(HTMLElement.prototype.animate).mock.calls.length)
  })

  it('пока размера нет (скрыт, ещё не разложен) — только блик', async () => {
    containerSize(0, 0)
    const wrapper = await mount(NataskiumAmbience, { tone: 'dark' })
    expect(wrapper.find('.nataskium-ambience__glint').exists()).toBe(true)
    expect(wrapper.find('.blinking-pads').exists()).toBe(false)
    expect(wrapper.find('.ambient-signals').exists()).toBe(false)
  })
})

describe('IntroThemeAmbience', () => {
  it.each([
    ['nataskium-night', 'dark'],
    ['nataskium-day', 'light'],
  ])('%s — фон темы кодом с тоном %s', async (themeKey, tone) => {
    const wrapper = await mount(IntroThemeAmbience, { themeKey })
    expect(wrapper.get('.nataskium-ambience').classes()).toContain(`nataskium-ambience--${tone}`)
  })

  it('неизвестный ключ — тема по умолчанию (ночь)', async () => {
    const wrapper = await mount(IntroThemeAmbience, { themeKey: 'qa-unknown' })
    expect(wrapper.get('.nataskium-ambience').classes()).toContain('nataskium-ambience--dark')
  })
})
