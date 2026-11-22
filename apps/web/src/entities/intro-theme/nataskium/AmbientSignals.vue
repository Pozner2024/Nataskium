<template>
  <div class="ambient-signals" aria-hidden="true">
    <!-- Тусклые дорожки и площадки неподвижны: рисуются один раз -->
    <svg class="ambient-signals__board" :viewBox="`0 0 ${width} ${height}`" focusable="false">
      <g v-for="(route, index) in routes" :key="index">
        <path class="ambient-signals__trace" :d="route.d" :style="{ stroke: colors.trace }" />
        <circle class="ambient-signals__pad" :cx="route.end.x" :cy="route.end.y" :r="PAD_RADIUS" :style="{ stroke: colors.trace, fill: colors.pad }" />
      </g>
    </svg>
    <!-- Импульс и вспышка площадки — HTML-элементы, двигаются только transform и opacity (их анимирует видеокарта) -->
    <span
      v-for="(route, index) in routes"
      :key="`pulse-${index}`"
      :ref="(element) => keepPulse(index, element)"
      class="ambient-signals__pulse"
      :style="{ '--pulse-core': colors.core, '--pulse-halo': colors.halo }"
    />
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
// Длина светящегося хвоста импульса и его толщина, px — те же, что $pulse-length и $pulse-thickness в стилях
const PULSE_LENGTH = 40
const PULSE_THICKNESS = 3

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

const pulses: HTMLElement[] = []
const flashes: HTMLElement[] = []
let animations: Animation[] = []

function keepPulse(index: number, element: unknown) {
  if (element instanceof HTMLElement) pulses[index] = element
}

function keepFlash(index: number, element: unknown) {
  if (element instanceof HTMLElement) flashes[index] = element
}

// Голова импульса в точке, хвост вытянут назад по направлению движения
function pulseTransform(point: Point, angle: number): string {
  return `translate(${point.x}px, ${point.y}px) rotate(${angle}rad) translate(${-PULSE_LENGTH}px, ${-PULSE_THICKNESS / 2}px)`
}

// Кадры движения по ломаной: доля пути пропорциональна длине отрезка, на поворотах угол меняется мгновенно
function pulseKeyframes(points: Point[]): Keyframe[] {
  const segments = points.slice(1).map((point, index) => {
    const from = points[index]!
    return { from, to: point, length: Math.hypot(point.x - from.x, point.y - from.y), angle: Math.atan2(point.y - from.y, point.x - from.x) }
  })
  const total = segments.reduce((sum, segment) => sum + segment.length, 0)
  const frames: Keyframe[] = []
  let passed = 0
  for (const segment of segments) {
    frames.push({ offset: (passed / total) * RUN_SHARE, transform: pulseTransform(segment.from, segment.angle), opacity: 1 })
    passed += segment.length
    frames.push({ offset: (passed / total) * RUN_SHARE, transform: pulseTransform(segment.to, segment.angle), opacity: 1 })
  }
  const last = frames[frames.length - 1]!
  frames[0] = { ...frames[0], opacity: 0 }
  frames.splice(1, 0, { ...frames[0], offset: FADE_SHARE / 4, opacity: 1 })
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
    const timing: KeyframeAnimationOptions = { duration: CYCLE_MS, delay: index * SIGNAL_STAGGER_MS, iterations: Infinity, fill: 'both' }
    const pulse = pulses[index]
    const flash = flashes[index]
    if (typeof pulse?.animate !== 'function' || !flash) return
    animations.push(pulse.animate(pulseKeyframes(route.points), timing), flash.animate(FLASH_KEYFRAMES, timing))
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
$pulse-length: 40px;
$pulse-thickness: 3px;
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

// Голова импульса справа, хвост гаснет назад; ореол — тень, она рисуется один раз
.ambient-signals__pulse {
  position: absolute;
  top: 0;
  left: 0;
  width: $pulse-length;
  height: $pulse-thickness;
  border-radius: $pulse-thickness;
  background: linear-gradient(to right, transparent, var(--pulse-core));
  box-shadow: 0 0 8px var(--pulse-halo);
  opacity: 0;
  transform-origin: 0 0;
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
