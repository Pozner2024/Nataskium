<template>
  <div class="ambient-signals" aria-hidden="true">
    <!-- Тусклые дорожки и площадки неподвижны: рисуются один раз -->
    <svg class="ambient-signals__board" :viewBox="`0 0 ${width} ${height}`" focusable="false">
      <g v-for="(route, index) in routes" :key="index">
        <path class="ambient-signals__trace" :d="route.d" :style="{ stroke: colors.trace }" />
        <circle class="ambient-signals__pad" :cx="route.end.x" :cy="route.end.y" :r="PAD_RADIUS" :style="{ stroke: colors.trace, fill: colors.pad }" />
      </g>
    </svg>
    <!-- Импульс и вспышка площадки — HTML-элементы, двигаются только transform и opacity (их анимирует видеокарта).
         Импульс — цепочка точек: каждая идёт по ломаной сама, поэтому хвост огибает излом, а не поворачивается целиком -->
    <template v-for="(route, index) in routes" :key="`pulse-${index}`">
      <span
        v-for="dot in TRAIL_DOTS"
        :key="dot"
        :ref="(element) => keepPulse(index, dot - 1, element)"
        class="ambient-signals__pulse"
        :style="{ '--pulse-core': colors.core, '--pulse-halo': colors.halo }"
      />
    </template>
    <span
      v-for="(route, index) in routes"
      :key="`flash-${index}`"
      :ref="(element) => keepFlash(index, element)"
      class="ambient-signals__flash"
      :style="{ left: `${route.end.x}px`, top: `${route.end.y}px`, '--pulse-core': colors.core, '--pulse-halo': colors.halo }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import type { IntroThemeTone } from '../types'
import { ROUTE_COLORS } from './entrance'
import { ambientRoutes, type Point } from './layout'

// Импульсы идут по очереди: при четырёх дорожках и цикле 12 с — один раз в 3 с.
// Импульс бежит первые 12% цикла (~1,4 с), площадка вспыхивает, когда он добегает
const CYCLE_MS = 12000
const SIGNAL_STAGGER_MS = 3000
const RUN_SHARE = 0.12
const FADE_SHARE = 0.02
const FLASH = { peak: 0.13, end: 0.25, scale: 1.4 }
const PAD_RADIUS = 6
// Хвост импульса: точки через TRAIL_GAP_PX по пути (вместе ~40 px) сливаются в полоску, к концу тусклее и мельче
const TRAIL_DOTS = 14
const TRAIL_GAP_PX = 3
const TRAIL_FADE = { opacity: 0.85, scale: 0.5 }

const props = defineProps<{
  width: number
  height: number
  tone: IntroThemeTone
}>()

const colors = computed(() => ROUTE_COLORS[props.tone])

const routes = computed(() =>
  ambientRoutes(props.width, props.height).map((points) => ({
    points,
    d: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
    end: points[points.length - 1]!,
  })),
)

const pulses: HTMLElement[][] = []
const flashes: HTMLElement[] = []
let animations: Animation[] = []

function keepPulse(index: number, dot: number, element: unknown) {
  if (!(element instanceof HTMLElement)) return
  pulses[index] ??= []
  pulses[index][dot] = element
}

function keepFlash(index: number, element: unknown) {
  if (element instanceof HTMLElement) flashes[index] = element
}

function routeLength(points: Point[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0)
}

// Кадры движения точки по ломаной: доля пути пропорциональна длине отрезка
function pulseKeyframes(points: Point[], opacity: number, scale: number): Keyframe[] {
  const total = routeLength(points)
  const at = (point: Point) => `translate(${point.x}px, ${point.y}px) scale(${scale})`
  const frames: Keyframe[] = []
  let passed = 0
  points.forEach((point, index) => {
    if (index > 0) passed += Math.hypot(point.x - points[index - 1]!.x, point.y - points[index - 1]!.y)
    frames.push({ offset: (passed / total) * RUN_SHARE, transform: at(point), opacity })
  })
  const last = frames[frames.length - 1]!
  frames[0] = { ...frames[0], opacity: 0 }
  frames.splice(1, 0, { ...frames[0], offset: FADE_SHARE / 4, opacity })
  frames.push({ offset: RUN_SHARE + FADE_SHARE, transform: last.transform, opacity: 0 })
  frames.push({ offset: 1, transform: last.transform, opacity: 0 })
  return frames
}

const FLASH_KEYFRAMES: Keyframe[] = [
  { offset: 0, opacity: 0, transform: 'scale(1)' },
  { offset: RUN_SHARE - FADE_SHARE, opacity: 0, transform: 'scale(1)' },
  { offset: FLASH.peak, opacity: 1, transform: `scale(${FLASH.scale})` },
  { offset: FLASH.end, opacity: 0, transform: 'scale(1)' },
  { offset: 1, opacity: 0, transform: 'scale(1)' },
]

function stop() {
  for (const animation of animations) animation.cancel()
  animations = []
}

function start() {
  stop()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  routes.value.forEach((route, index) => {
    const delay = index * SIGNAL_STAGGER_MS
    const timing: KeyframeAnimationOptions = { duration: CYCLE_MS, delay, iterations: Infinity, fill: 'both' }
    const dots = pulses[index] ?? []
    const flash = flashes[index]
    if (typeof flash?.animate !== 'function') return
    // Отставание точки хвоста — время, за которое импульс проходит TRAIL_GAP_PX
    const lagMs = (TRAIL_GAP_PX * RUN_SHARE * CYCLE_MS) / routeLength(route.points)
    dots.forEach((dot, position) => {
      const share = position / (TRAIL_DOTS - 1)
      const keyframes = pulseKeyframes(route.points, 1 - share * TRAIL_FADE.opacity, 1 - share * TRAIL_FADE.scale)
      animations.push(dot.animate(keyframes, { ...timing, delay: delay + position * lagMs }))
    })
    animations.push(flash.animate(FLASH_KEYFRAMES, timing))
  })
}

onMounted(start)
watch(routes, async () => {
  await nextTick()
  start()
})
onBeforeUnmount(stop)
</script>

<style scoped lang="scss">
// Точка импульса шире, но с мягким краем: соседние точки сливаются в размытую полоску
$pulse-dot: 12px;
$flash-size: 12px;

.ambient-signals {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.ambient-signals__board {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.ambient-signals__trace {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.3;
}

.ambient-signals__pad {
  stroke-width: 2;
  opacity: 0.35;
}

// Размытие — градиентом, а не filter: точка рисуется один раз, двигаются только transform и opacity
.ambient-signals__pulse {
  position: absolute;
  top: 0;
  left: 0;
  width: $pulse-dot;
  height: $pulse-dot;
  margin: calc(#{$pulse-dot} / -2) 0 0 calc(#{$pulse-dot} / -2);
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--pulse-core), var(--pulse-halo) 30%, transparent);
  opacity: 0;
  will-change: transform, opacity;
}

.ambient-signals__flash {
  position: absolute;
  width: $flash-size;
  height: $flash-size;
  margin: calc(#{$flash-size} / -2) 0 0 calc(#{$flash-size} / -2);
  border-radius: 50%;
  background: var(--pulse-core);
  box-shadow: 0 0 10px var(--pulse-halo);
  opacity: 0;
  will-change: transform, opacity;
}

@media (prefers-reduced-motion: reduce) {
  .ambient-signals__pulse,
  .ambient-signals__flash {
    display: none;
  }
}
</style>
