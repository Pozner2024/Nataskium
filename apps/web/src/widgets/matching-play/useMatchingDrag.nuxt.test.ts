import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { effectScope, ref, type Ref } from 'vue'
import type { DropTarget } from './types'
import { useMatchingDrag, type DragSource } from './useMatchingDrag'

const POINTER_ID = 1
const SOURCE = { term: 0, from: null }

// Контейнер высотой 400 (top 100, bottom 500), лоток заканчивается на 200: зона автопрокрутки 200..500, край 64 пикселя
const CONTAINER = { top: 100, bottom: 500 }
const TRAY_BOTTOM = 200
const MIDDLE_Y = 350
const NEAR_BOTTOM_Y = 495
const NEAR_TOP_Y = 205
const ABOVE_TRAY_Y = 150

function rect(top: number, bottom: number): DOMRect {
  return { top, bottom, left: 0, right: 300, width: 300, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }
}

function element(top: number, bottom: number): HTMLElement {
  const node = document.createElement('div')
  node.getBoundingClientRect = () => rect(top, bottom)
  return node
}

function press(chip: HTMLElement, y: number): void {
  drag.startPress({ pointerType: 'touch', button: 0, pointerId: POINTER_ID, clientX: 10, clientY: y, currentTarget: chip } as unknown as PointerEvent, SOURCE)
}

function move(y: number): void {
  window.dispatchEvent(new PointerEvent('pointermove', { pointerId: POINTER_ID, clientX: 10, clientY: y, cancelable: true }))
}

// Один кадр requestAnimationFrame
function frame(): void {
  vi.advanceTimersToNextFrame()
}

type Drag = ReturnType<typeof useMatchingDrag>
let drag: Drag
let scope: ReturnType<typeof effectScope>
let container: HTMLElement
let containerScrollBy: ReturnType<typeof vi.fn>
let windowScrollBy: ReturnType<typeof vi.spyOn>
let scrollContainer: Ref<HTMLElement | null>
let onDrop: Mock<(source: DragSource, target: DropTarget | null) => void>

function setup(options: { container?: boolean } = {}): HTMLElement {
  const tray = element(0, TRAY_BOTTOM)
  const chip = element(0, 40)
  scope = effectScope()
  scope.run(() => {
    drag = useMatchingDrag({
      tray: ref(tray),
      scrollContainer: options.container === false ? null : scrollContainer,
      definitions: () => [],
      isLocked: ref(false),
      onLift: vi.fn(),
      onDrop,
    })
  })
  return chip
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] })
  container = element(CONTAINER.top, CONTAINER.bottom)
  containerScrollBy = vi.fn()
  container.scrollBy = containerScrollBy as unknown as HTMLElement['scrollBy']
  scrollContainer = ref(container)
  onDrop = vi.fn<(source: DragSource, target: DropTarget | null) => void>()
  windowScrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined)
})

afterEach(() => {
  scope.stop()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useMatchingDrag: автопрокрутка слота проигрывателя', () => {
  it('у нижнего края контейнера листает контейнер вниз, а не окно', () => {
    const chip = setup()
    press(chip, MIDDLE_Y)
    move(NEAR_BOTTOM_Y)
    frame()

    expect(drag.dragged.value).not.toBeNull()
    expect(containerScrollBy).toHaveBeenCalled()
    expect(containerScrollBy.mock.calls[0]?.[1]).toBeGreaterThan(0)
    expect(windowScrollBy).not.toHaveBeenCalled()
  })

  it('в полосе сразу под лотком листает контейнер вверх', () => {
    const chip = setup()
    press(chip, MIDDLE_Y)
    move(NEAR_TOP_Y)
    frame()

    expect(containerScrollBy.mock.calls[0]?.[1]).toBeLessThan(0)
    expect(windowScrollBy).not.toHaveBeenCalled()
  })

  it('в середине зоны прокрутки нет', () => {
    const chip = setup()
    press(chip, MIDDLE_Y)
    move(MIDDLE_Y)
    frame()

    expect(containerScrollBy).not.toHaveBeenCalled()
    expect(windowScrollBy).not.toHaveBeenCalled()
  })

  it('над лотком прокрутки нет: слово возвращают к словам', () => {
    const chip = setup()
    press(chip, MIDDLE_Y)
    move(ABOVE_TRAY_Y)
    frame()

    expect(containerScrollBy).not.toHaveBeenCalled()
  })

  it('палец стоит, а кадры идут: прокрутка продолжается каждый кадр', () => {
    const chip = setup()
    press(chip, MIDDLE_Y)
    move(NEAR_BOTTOM_Y)
    frame()
    frame()
    frame()

    expect(containerScrollBy).toHaveBeenCalledTimes(3)
  })

  it('без scrollContainer листается окно', () => {
    const chip = setup({ container: false })
    press(chip, MIDDLE_Y)
    move(window.innerHeight - 1)
    frame()

    expect(windowScrollBy).toHaveBeenCalled()
    expect(containerScrollBy).not.toHaveBeenCalled()
  })

  it('контейнер ещё не смонтирован (ref пуст): листается окно', () => {
    scrollContainer.value = null
    const chip = setup()
    press(chip, MIDDLE_Y)
    move(window.innerHeight - 1)
    frame()

    expect(windowScrollBy).toHaveBeenCalled()
    expect(containerScrollBy).not.toHaveBeenCalled()
  })

  it('Escape отменяет жест: кадры больше не листают', () => {
    const chip = setup()
    press(chip, MIDDLE_Y)
    move(NEAR_BOTTOM_Y)
    frame()
    containerScrollBy.mockClear()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    frame()
    frame()

    expect(drag.dragged.value).toBeNull()
    expect(containerScrollBy).not.toHaveBeenCalled()
  })

  it('тап без сдвига: перетаскивания и прокрутки нет', () => {
    const chip = setup()
    press(chip, MIDDLE_Y)
    move(MIDDLE_Y + 2)
    frame()

    expect(drag.dragged.value).toBeNull()
    expect(containerScrollBy).not.toHaveBeenCalled()
  })
})
