interface Point {
  x: number
  y: number
}

const PCB_SELECTOR = '[data-pcb]'
const POINTER_IDLE_MS = 1200
const TICK_SLACK_MS = 100
// Доля расстояния, которую пятно проходит за кадр: чем меньше, тем плавнее и медленнее следует за курсором
const FOLLOW_SPEED = 0.18
const OFF_SCREEN_PX = -1000

// Свечение платы за курсором: координаты пятна пишутся в CSS-переменные блоков с data-pcb
export function initPcbGlow(): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

  let pointer: Point | null = null
  let lastMoveAt = 0
  let frameId = 0
  const current = new Map<HTMLElement, Point>()

  function updateZone(el: HTMLElement, rect: DOMRect, active: boolean) {
    const from = current.get(el) ?? { x: OFF_SCREEN_PX, y: OFF_SCREEN_PX }
    const to = pointer ? { x: pointer.x - rect.left, y: pointer.y - rect.top } : from
    const next = { x: from.x + (to.x - from.x) * FOLLOW_SPEED, y: from.y + (to.y - from.y) * FOLLOW_SPEED }
    current.set(el, next)
    el.style.setProperty('--pcb-x', `${next.x}px`)
    el.style.setProperty('--pcb-y', `${next.y}px`)
    el.style.setProperty('--pcb-glow-opacity', active ? '1' : '0')
  }

  function tick() {
    const now = performance.now()
    const pointerActive = pointer !== null && now - lastMoveAt < POINTER_IDLE_MS
    for (const el of document.querySelectorAll<HTMLElement>(PCB_SELECTOR)) {
      const rect = el.getBoundingClientRect()
      const inside = pointerActive && pointer !== null
        && pointer.x >= rect.left && pointer.x <= rect.right
        && pointer.y >= rect.top && pointer.y <= rect.bottom
      updateZone(el, rect, inside)
    }
    // Последний кадр после остановки курсора выставляет прозрачность в 0, и CSS плавно её гасит
    frameId = now - lastMoveAt < POINTER_IDLE_MS + TICK_SLACK_MS ? requestAnimationFrame(tick) : 0
  }

  function onPointerMove(event: PointerEvent) {
    pointer = { x: event.clientX, y: event.clientY }
    lastMoveAt = performance.now()
    if (!frameId) frameId = requestAnimationFrame(tick)
  }

  function onPointerLeave() {
    pointer = null
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onPointerLeave)

  return () => {
    window.removeEventListener('pointermove', onPointerMove)
    document.documentElement.removeEventListener('pointerleave', onPointerLeave)
    cancelAnimationFrame(frameId)
  }
}
