import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { autoScrollStep, exceedsThreshold, hitTarget, type Rect } from './dragGeometry'
import type { DropTarget, Point } from './types'

// Сдвиг пальца до начала перетаскивания: меньше — это тап
const DRAG_THRESHOLD_PX = 8
// Полоса у края, где работает автопрокрутка, и её наибольшая скорость за кадр
const AUTO_SCROLL_EDGE_PX = 64
const AUTO_SCROLL_MAX_STEP_PX = 18
const PRIMARY_BUTTON = 0
// Сбросить после click текущего жеста: браузер шлёт его в той же задаче, что и pointerup
const CLICK_SUPPRESS_RESET_MS = 0

// from — индекс определения, у которого стояло слово; null — слово взято из лотка
export type DragSource = { term: number; from: number | null }

export type DraggedChip = DragSource & {
  // Точка захвата внутри плитки и её размер: плитка в руке не прыгает под пальцем
  offset: Point
  width: number
}

type Press = { source: DragSource; pointerId: number; start: Point; offset: Point; width: number }

type DragOptions = {
  tray: Readonly<Ref<HTMLElement | null>>
  definitions: () => readonly (HTMLElement | null)[]
  isLocked: Readonly<Ref<boolean>>
  onLift: (source: DragSource) => void
  onDrop: (source: DragSource, target: DropTarget | null) => void
}

function rectOf(element: HTMLElement | null): Rect | null {
  return element ? element.getBoundingClientRect() : null
}

// Перетаскивание на Pointer Events. Слушатели — на window: исходная плитка может исчезнуть из DOM посреди жеста
export function useMatchingDrag(options: DragOptions) {
  const dragged = ref<DraggedChip | null>(null)
  const pointer = ref<Point>({ x: 0, y: 0 })
  const over = ref<DropTarget | null>(null)
  let press: Press | null = null
  let frame: number | null = null
  // После отпускания браузер шлёт click по плитке: это не тап, выбор не включаем
  let suppressClick = false

  function updateOver(): void {
    over.value = hitTarget(pointer.value, rectOf(options.tray.value), options.definitions().map(rectOf))
  }

  // Палец может стоять, пока страница едет: цель пересчитывается каждый кадр
  function scrollFrame(): void {
    frame = null
    if (dragged.value === null) return
    const trayBottom = options.tray.value?.getBoundingClientRect().bottom ?? 0
    const step = autoScrollStep(pointer.value.y, { top: trayBottom, bottom: window.innerHeight }, AUTO_SCROLL_EDGE_PX, AUTO_SCROLL_MAX_STEP_PX)
    if (step !== 0) window.scrollBy(0, step)
    updateOver()
    frame = requestAnimationFrame(scrollFrame)
  }

  function removeListeners(): void {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('blur', cancel)
    window.removeEventListener('keydown', onKeydown)
  }

  function finish(): void {
    removeListeners()
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    press = null
    dragged.value = null
    over.value = null
  }

  // Слово возвращается туда, откуда его взяли
  function cancel(): void {
    finish()
  }

  function lift(): void {
    if (press === null) return
    dragged.value = { ...press.source, offset: press.offset, width: press.width }
    options.onLift(press.source)
    updateOver()
    frame = requestAnimationFrame(scrollFrame)
  }

  function onMove(event: PointerEvent): void {
    if (press === null || event.pointerId !== press.pointerId) return
    pointer.value = { x: event.clientX, y: event.clientY }
    if (dragged.value === null) {
      if (!exceedsThreshold(press.start, pointer.value, DRAG_THRESHOLD_PX)) return
      lift()
    }
    event.preventDefault()
    updateOver()
  }

  function onUp(event: PointerEvent): void {
    if (press === null || event.pointerId !== press.pointerId) return
    const source = dragged.value
    const target = over.value
    finish()
    if (source === null) return
    suppressClick = true
    setTimeout(() => {
      suppressClick = false
    }, CLICK_SUPPRESS_RESET_MS)
    options.onDrop({ term: source.term, from: source.from }, target)
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && dragged.value !== null) cancel()
  }

  function startPress(event: PointerEvent, source: DragSource): void {
    if (options.isLocked.value || press !== null) return
    if (event.pointerType === 'mouse' && event.button !== PRIMARY_BUTTON) return
    const chip = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null
    press = {
      source,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      offset: chip ? { x: event.clientX - chip.left, y: event.clientY - chip.top } : { x: 0, y: 0 },
      width: chip?.width ?? 0,
    }
    pointer.value = press.start
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', onKeydown)
  }

  function consumeClick(): boolean {
    if (!suppressClick) return false
    suppressClick = false
    return true
  }

  // Время вышло или идёт проверка — слово в руке возвращается на место
  watch(options.isLocked, (locked) => {
    if (locked) cancel()
  })

  onScopeDispose(finish)

  return { dragged, pointer, over, startPress, consumeClick, cancel }
}
