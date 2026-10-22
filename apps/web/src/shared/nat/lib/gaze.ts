import { onMounted, onUnmounted, type Ref } from 'vue'

const GAZE_EASING = 0.12

export interface Point {
  x: number
  y: number
}

export const NO_GAZE: Point = { x: 0, y: 0 }

// Вблизи головы взгляд слабее, дальше reach — упирается в край
export function aimAt(head: Point, target: Point, reach: number): Point {
  const dx = target.x - head.x
  const dy = target.y - head.y
  const distance = Math.hypot(dx, dy) || 1
  const k = Math.min(distance / reach, 1) / distance
  return { x: dx * k, y: dy * k }
}

export function easeGaze(current: Point, goal: Point, isReducedMotion: boolean): Point {
  const ease = isReducedMotion ? 1 : GAZE_EASING
  return {
    x: current.x + (goal.x - current.x) * ease,
    y: current.y + (goal.y - current.y) * ease,
  }
}

// Курсор в координатах SVG; null — курсор ушёл со страницы или окно потеряло фокус
export function useSvgPointer(svg: Ref<SVGSVGElement | null>) {
  let pointer: Point | null = null

  function onMove(event: PointerEvent) {
    const ctm = svg.value?.getScreenCTM()
    if (!ctm) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
    pointer = { x: point.x, y: point.y }
  }

  function reset() {
    pointer = null
  }

  onMounted(() => {
    window.addEventListener('pointermove', onMove)
    window.addEventListener('blur', reset)
    document.documentElement.addEventListener('mouseleave', reset)
  })

  onUnmounted(() => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('blur', reset)
    document.documentElement.removeEventListener('mouseleave', reset)
  })

  return () => pointer
}
