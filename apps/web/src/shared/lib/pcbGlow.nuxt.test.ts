import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PCB_TRAIL_POINTS, initPcbGlow } from './pcbGlow'

// Кадры подменяются: тест сам решает, когда наступает следующий кадр и который час на часах
let frames: FrameRequestCallback[]
let clock: number
let reducedMotion: boolean

function runFrame(advanceMs = 16) {
  clock += advanceMs
  const queued = frames
  frames = []
  for (const callback of queued) callback(clock)
}

function pointer(type: string, x: number, y: number, pointerType = 'mouse') {
  const event = new Event(type) as Event & { clientX: number; clientY: number; pointerType: string }
  Object.assign(event, { clientX: x, clientY: y, pointerType })
  window.dispatchEvent(event)
}

function zone(): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-pcb', '')
  el.getBoundingClientRect = () => ({ left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200, x: 100, y: 100, toJSON() {} }) as DOMRect
  document.body.appendChild(el)
  return el
}

let el: HTMLElement
let stop: () => void

beforeEach(() => {
  frames = []
  clock = 1000
  reducedMotion = false
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList)
  el = zone()
})

afterEach(() => {
  stop?.()
  el.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('initPcbGlow: мышь над зоной', () => {
  it('курсор внутри зоны — пятно включено, координаты и точки шлейфа записаны', () => {
    stop = initPcbGlow()

    pointer('pointermove', 150, 150)
    runFrame()

    expect(el.hasAttribute('data-pcb-active')).toBe(true)
    expect(el.style.getPropertyValue('--pcb-glow-on')).toBe('1')
    expect(el.style.getPropertyValue(`--pcb-trail-${PCB_TRAIL_POINTS - 1}-x`)).not.toBe('')
  })

  it('касание не включает пятно: у касания нет наведения', () => {
    stop = initPcbGlow()

    pointer('pointermove', 150, 150, 'touch')
    runFrame()

    expect(el.hasAttribute('data-pcb-active')).toBe(false)
    expect(frames).toHaveLength(0)
  })

  it('курсор вне зоны — пятно выключено', () => {
    stop = initPcbGlow()

    pointer('pointermove', 10, 10)
    runFrame()

    expect(el.hasAttribute('data-pcb-active')).toBe(false)
    expect(el.style.getPropertyValue('--pcb-glow-on')).toBe('0')
  })

  it('курсор ушёл со страницы — пятно гаснет на следующем кадре', () => {
    stop = initPcbGlow()
    pointer('pointermove', 150, 150)
    runFrame()

    document.documentElement.dispatchEvent(new Event('pointerleave'))
    runFrame()

    expect(el.hasAttribute('data-pcb-active')).toBe(false)
  })

  it('в простое цикл кадров останавливается', () => {
    stop = initPcbGlow()
    pointer('pointermove', 150, 150)
    runFrame()

    // Больше полутора секунд без движения мыши
    for (let step = 0; step < 120 && frames.length > 0; step++) runFrame(50)

    expect(frames).toHaveLength(0)
  })
})

describe('initPcbGlow: выключено', () => {
  it('prefers-reduced-motion — ничего не подписывается, пятна нет', () => {
    reducedMotion = true
    stop = initPcbGlow()

    pointer('pointermove', 150, 150)

    expect(frames).toHaveLength(0)
    expect(el.hasAttribute('data-pcb-active')).toBe(false)
  })

  it('после остановки (stop) движение мыши больше не обрабатывается', () => {
    stop = initPcbGlow()
    stop()

    pointer('pointermove', 150, 150)

    expect(frames).toHaveLength(0)
    expect(el.hasAttribute('data-pcb-active')).toBe(false)
  })
})
