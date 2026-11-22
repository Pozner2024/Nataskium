import { loadGsap } from '../loadGsap'
import type { IntroEntrance, IntroEntranceTargets, IntroSound, IntroThemeTone } from '../types'
import { signalRoute, type Point } from './layout'

const SVG_NS = 'http://www.w3.org/2000/svg'

// Тайминги из прототипа hyperframes-lab/work/brand-intro (brand.html, question-demo.html), секунды
const SIGNAL = { duration: 1.1, pulseLength: 140 }
const ROUTE_FADE = { after: 0.4, duration: 0.5 }
const FRAME = { duration: 0.45 }
const DOTS = { at: 0.4, duration: 0.25, stagger: 0.05 }
const ITEMS = { at: 0.5, duration: 0.5, stagger: 0.07, fromY: 40, fromScale: 0.96, soundDelay: 0.1 }
const ZOOM = { at: 1.4, duration: 0.75, fromScale: 0.86 }
const PADS = { radius: 7, at: 0.5, duration: 0.25 }
// Площадки и точки окна «выщёлкиваются» с заметным перелётом, элементы задания приземляются мягче
const POP_EASE = 'back.out(2.5)'
const LAND_EASE = 'back.out(1.4)'
const ENTRY_SHARE = 0.83
// Дорожка тусклая, под импульсом — мягкий ореол, сверху — яркое ядро
const TRACE = { width: 3, opacity: 0.45 }
const HALO = { width: 10, opacity: 0.22 }
const CORE_WIDTH = 3
const PULSE_CORE_DARK = '#e4ecff'

// Цвета из токенов бренда; слой сигнала живёт в корне проигрывателя, поэтому задаются инлайн-стилем, а не классами
export const ROUTE_COLORS: Record<IntroThemeTone, { trace: string; core: string; halo: string; pad: string }> = {
  dark: { trace: 'var(--color-blue)', core: PULSE_CORE_DARK, halo: 'var(--color-blue-light)', pad: 'var(--color-night)' },
  light: { trace: 'var(--color-blue)', core: 'var(--color-blue-dark)', halo: 'var(--color-blue-light)', pad: 'var(--color-white)' },
}

const OVERLAY_STYLE = 'position:absolute;overflow:visible;pointer-events:none'

// Цвета через style: в атрибутах SVG var() не работает
function paint(element: SVGElement, colors: { stroke?: string; fill?: string }): void {
  if (colors.stroke) element.style.stroke = colors.stroke
  if (colors.fill) element.style.fill = colors.fill
}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value))
  return element
}

function pathOf(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

// Слой сигнала над скримом проигрывателя: дорожка, импульс и площадки на поворотах
function drawRoute(stage: HTMLElement, points: Point[], tone: IntroThemeTone) {
  const colors = ROUTE_COLORS[tone]
  const { width, height } = stage.getBoundingClientRect()
  const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' })
  svg.style.cssText = `${OVERLAY_STYLE};inset:0;width:100%;height:100%`
  const d = pathOf(points)
  const trace = svgElement('path', { d, fill: 'none', 'stroke-width': TRACE.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: TRACE.opacity })
  const halo = svgElement('path', { d, fill: 'none', 'stroke-width': HALO.width, 'stroke-linecap': 'round', opacity: HALO.opacity })
  const core = svgElement('path', { d, fill: 'none', 'stroke-width': CORE_WIDTH, 'stroke-linecap': 'round' })
  paint(trace, { stroke: colors.trace })
  paint(halo, { stroke: colors.halo })
  paint(core, { stroke: colors.core })
  const pads = points.slice(1, -1).map((point) => {
    const pad = svgElement('circle', { cx: point.x, cy: point.y, r: PADS.radius, 'stroke-width': TRACE.width, opacity: 0 })
    paint(pad, { stroke: colors.trace, fill: colors.pad })
    return pad
  })
  svg.append(trace, halo, core, ...pads)
  stage.append(svg)
  return { svg, trace, pulse: [halo, core], pads }
}

// Доля периметра рамки (по ходу часовой стрелки от верхнего левого скругления), где стоит точка входа
function entryShare(width: number, height: number, radius: number, entryX: number): number {
  const perimeter = 2 * (width + height) - (8 - 2 * Math.PI) * radius
  return (entryX - radius) / perimeter
}

// Рамка рисуется ровно поверх рамки карточки (border), которая во время вылета прозрачна
export function drawFrame(card: HTMLElement, tone: IntroThemeTone) {
  const style = getComputedStyle(card)
  const border = parseFloat(style.borderTopWidth) || 0
  const radius = parseFloat(style.borderTopLeftRadius) || 0
  const width = card.offsetWidth
  const height = card.offsetHeight
  const svg = svgElement('svg', { 'aria-hidden': 'true', focusable: 'false' })
  svg.style.cssText = `${OVERLAY_STYLE};left:${-border}px;top:${-border}px;width:${width}px;height:${height}px`
  const half = border / 2
  const rect = svgElement('rect', {
    x: half,
    y: half,
    width: width - border,
    height: height - border,
    rx: Math.max(0, radius - half),
    fill: 'none',
    'stroke-width': border,
    pathLength: 1,
    'stroke-dasharray': '0 1',
  })
  paint(rect, { stroke: ROUTE_COLORS[tone].trace })
  svg.append(rect)
  card.append(svg)
  return { svg, rect, share: entryShare(width, height, radius, width * ENTRY_SHARE) }
}

// Вылет первого вопроса темы Nataskium: сигнал по дорожке к верхнему краю карточки, рамка расходится от точки входа
// в обе стороны, затем точки окна и элементы по очереди; карточка приближается к итоговому размеру.
// Варианты нельзя нажать, пока они не приземлились (inert)
export function createNataskiumEntrance(stage: HTMLElement, tone: IntroThemeTone, sound: IntroSound | null): IntroEntrance {
  let finishNow: (() => void) | null = null
  let cancelled = false

  async function run(targets: IntroEntranceTargets): Promise<void> {
    const { card, dots, items, ceiling, onReady } = targets
    const cleanups: Array<() => void> = []
    for (const item of items) item.inert = true
    try {
      const gsap = await loadGsap()
      // Ушли со страницы, пока грузился GSAP: вылет не начинается
      if (cancelled) return
      // Откат регистрируется до построения: если построение упадёт, начальные стили (opacity: 0) всё равно снимутся
      const context = gsap.context(() => {}, stage)
      cleanups.push(() => context.revert())
      await new Promise<void>((resolve) => {
        context.add(() => {
          gsap.set(items, { opacity: 0, y: ITEMS.fromY, scale: ITEMS.fromScale })
          if (dots) gsap.set(dots, { opacity: 0 })
          gsap.set(card, { scale: ZOOM.fromScale, transformOrigin: '50% 50%' })
          onReady()

          const stageBox = stage.getBoundingClientRect()
          const cardBox = card.getBoundingClientRect()
          const entry = { x: cardBox.left - stageBox.left + cardBox.width * ENTRY_SHARE, y: cardBox.top - stageBox.top }
          // Граница — низ элемента над карточкой или верх блока, внутри которого карточка
          const ceilingBox = ceiling?.getBoundingClientRect()
          const ceilingEdge = ceiling?.contains(card) ? ceilingBox?.top : ceilingBox?.bottom
          const ceilingY = ceilingEdge === undefined ? 0 : ceilingEdge - stageBox.top
          const route = drawRoute(stage, signalRoute(stageBox.width, stageBox.height, entry, ceilingY), tone)
          const frame = drawFrame(card, tone)
          cleanups.push(() => route.svg.remove(), () => frame.svg.remove())

          const length = route.trace.getTotalLength()
          const tl = gsap.timeline({ onComplete: resolve })
          tl.fromTo(route.trace, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: SIGNAL.duration, ease: 'none' }, 0)
          tl.fromTo(
            route.pulse,
            { strokeDasharray: `${SIGNAL.pulseLength} ${length + SIGNAL.pulseLength}`, strokeDashoffset: SIGNAL.pulseLength },
            { strokeDashoffset: SIGNAL.pulseLength - length, duration: SIGNAL.duration, ease: 'none' },
            0,
          )
          tl.to(route.pads, { opacity: 1, duration: PADS.duration, ease: POP_EASE }, SIGNAL.duration * PADS.at)
          tl.call(() => sound?.play('signal'), [], 0)

          const frameStart = SIGNAL.duration
          const reach = { half: 0 }
          tl.to(
            reach,
            {
              half: 0.5,
              duration: FRAME.duration,
              ease: 'power2.inOut',
              onUpdate: () => {
                frame.rect.setAttribute('stroke-dasharray', `${2 * reach.half} ${1 - 2 * reach.half}`)
                frame.rect.setAttribute('stroke-dashoffset', String(reach.half - frame.share))
              },
            },
            frameStart,
          )
          tl.call(() => sound?.play('frame'), [], frameStart)
          tl.to(route.svg, { opacity: 0, duration: ROUTE_FADE.duration, ease: 'power2.inOut' }, frameStart + ROUTE_FADE.after)
          if (dots) tl.to(dots, { opacity: 1, duration: DOTS.duration, ease: POP_EASE }, frameStart + DOTS.at)
          items.forEach((item, index) => {
            tl.to(
              item,
              {
                opacity: 1,
                y: 0,
                scale: 1,
                duration: ITEMS.duration,
                ease: LAND_EASE,
                onComplete: () => {
                  item.inert = false
                },
              },
              frameStart + ITEMS.at + index * ITEMS.stagger,
            )
            tl.call(() => sound?.play('answer'), [], frameStart + ITEMS.at + index * ITEMS.stagger + ITEMS.soundDelay)
          })
          const itemsEnd = frameStart + ITEMS.at + items.length * ITEMS.stagger
          tl.to(card, { scale: 1, duration: ZOOM.duration, ease: 'power3.inOut' }, Math.max(frameStart + ZOOM.at, itemsEnd))
          finishNow = () => tl.progress(1)
        })
      })
    } catch {
      // GSAP не загрузился или элемент пропал: сразу конечное состояние
    } finally {
      finishNow = null
      for (const cleanup of cleanups.reverse()) cleanup()
      for (const item of items) item.inert = false
      onReady()
    }
  }

  function cancel() {
    cancelled = true
    finishNow?.()
  }

  return { run, cancel }
}
