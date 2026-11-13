interface Point {
  x: number
  y: number
}

interface ZoneState {
  head: Point
  trail: Point[]
  lastSampleAt: number
}

const PCB_SELECTOR = '[data-pcb]'
const OFF_SCREEN_PX = -1000
// Доля пути до курсора за кадр: чем меньше, тем ленивее пятно догоняет мышь
const FOLLOW_SPEED = 0.3
// Сколько пятно остаётся видимым после остановки мыши
const POINTER_IDLE_MS = 1400
// Точек шлейфа за пятном; из этого числа PcbGlow собирает маску шлейфа
export const PCB_TRAIL_POINTS = 8
// Как часто запоминается точка пути для шлейфа
const TRAIL_SAMPLE_MS = 45

// Свечение платы за курсором со шлейфом. В блоки с data-pcb пишутся координаты пятна (--pcb-x, --pcb-y),
// точки шлейфа (--pcb-trail-N-x, --pcb-trail-N-y), --pcb-glow-on и атрибут data-pcb-active.
// Рисует их слой PcbGlow из shared/ui
export function initPcbGlow(): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

  let pointer: Point | null = null
  let lastMoveAt = 0
  let frameId = 0
  const states = new Map<HTMLElement, ZoneState>()

  function stateOf(el: HTMLElement): ZoneState {
    const existing = states.get(el)
    if (existing) return existing
    const start = { x: OFF_SCREEN_PX, y: OFF_SCREEN_PX }
    const created = { head: start, trail: Array.from({ length: PCB_TRAIL_POINTS }, () => start), lastSampleAt: 0 }
    states.set(el, created)
    return created
  }

  function writeTrail(el: HTMLElement, trail: Point[]) {
    trail.forEach((point, index) => {
      el.style.setProperty(`--pcb-trail-${index}-x`, `${point.x}px`)
      el.style.setProperty(`--pcb-trail-${index}-y`, `${point.y}px`)
    })
  }

  function updateZone(el: HTMLElement, now: number, isActive: boolean) {
    const rect = el.getBoundingClientRect()
    const state = stateOf(el)
    const inside = isActive && pointer !== null
      && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom
    const target = pointer ? { x: pointer.x - rect.left, y: pointer.y - rect.top } : state.head
    // Появление — сразу под курсором, а не выезд с места, где пятно погасло в прошлый раз
    if (inside && !el.hasAttribute('data-pcb-active')) {
      state.head = target
      state.trail = state.trail.map(() => target)
    }
    state.head = {
      x: state.head.x + (target.x - state.head.x) * FOLLOW_SPEED,
      y: state.head.y + (target.y - state.head.y) * FOLLOW_SPEED,
    }
    el.style.setProperty('--pcb-x', `${state.head.x}px`)
    el.style.setProperty('--pcb-y', `${state.head.y}px`)
    el.style.setProperty('--pcb-glow-on', inside ? '1' : '0')
    el.toggleAttribute('data-pcb-active', inside)

    if (now - state.lastSampleAt < TRAIL_SAMPLE_MS) return
    // Когда мышь стоит, в шлейф попадает одна и та же точка: след стягивается к пятну и растворяется вместе с ним
    state.trail = [state.head, ...state.trail.slice(0, -1)]
    state.lastSampleAt = now
    writeTrail(el, state.trail)
  }

  function tick() {
    const now = performance.now()
    const isActive = pointer !== null && now - lastMoveAt < POINTER_IDLE_MS
    for (const el of document.querySelectorAll<HTMLElement>(PCB_SELECTOR)) updateZone(el, now, isActive)
    // В простое цикл останавливается: последний кадр выключает пятно, погасание доигрывает CSS-переход
    frameId = isActive ? requestAnimationFrame(tick) : 0
  }

  // Только мышь: у касания нет «наведения»
  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    pointer = { x: event.clientX, y: event.clientY }
    lastMoveAt = performance.now()
    if (!frameId) frameId = requestAnimationFrame(tick)
  }

  // Мышь ушла со страницы: один кадр, чтобы выключить пятно
  function onPointerLeave() {
    pointer = null
    if (!frameId) frameId = requestAnimationFrame(tick)
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onPointerLeave)

  return () => {
    window.removeEventListener('pointermove', onPointerMove)
    document.documentElement.removeEventListener('pointerleave', onPointerLeave)
    cancelAnimationFrame(frameId)
  }
}
