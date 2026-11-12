<template>
  <svg
    class="energy-orb"
    viewBox="-50 -50 100 100"
    aria-hidden="true"
    :style="{ ...(size ? { width: size, height: size } : {}), '--spin': spinDuration }"
  >
    <defs>
      <radialGradient :id="shellId" cx="38%" cy="34%" r="70%">
        <stop offset="0" stop-color="#DFF9FF" stop-opacity=".35" />
        <stop offset=".5" stop-color="#53CFFF" stop-opacity=".7" />
        <stop offset=".85" stop-color="#3A74F5" stop-opacity=".9" />
        <stop offset="1" stop-color="#2549C5" stop-opacity=".95" />
      </radialGradient>
      <radialGradient :id="glowId">
        <stop offset=".3" stop-color="#4573F4" stop-opacity=".85" />
        <stop offset=".65" stop-color="#53CFFF" stop-opacity=".4" />
        <stop offset="1" stop-color="#53CFFF" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="coreId">
        <stop offset="0" stop-color="#FFFFFF" />
        <stop offset=".55" stop-color="#E9FFFF" />
        <stop offset="1" stop-color="#8DEBFF" stop-opacity="0" />
      </radialGradient>
      <filter :id="blurId">
        <feGaussianBlur stdDeviation="2" />
      </filter>
      <filter :id="glowBlurId" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
      <filter :id="sparkBlurId" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="0.4" />
      </filter>
    </defs>

    <g class="energy-orb__body" :style="{ transform: `scale(${bodyScale})` }">
      <circle class="energy-orb__glow" r="56" :fill="`url(#${glowId})`" :filter="`url(#${glowBlurId})`" :opacity="glowOpacity" />
      <circle class="energy-orb__shell" r="40" :fill="`url(#${shellId})`" />
      <g class="energy-orb__vortex energy-orb__vortex--glow" :filter="`url(#${blurId})`">
        <path
          v-for="(arm, i) in ARMS"
          :key="`glow-${i}`"
          class="energy-orb__arm"
          :d="arm.d"
          :stroke-width="arm.width * 2.2"
          :style="{ '--speed': arm.speed, '--direction': arm.direction }"
        />
      </g>
      <g class="energy-orb__vortex">
        <path
          v-for="(arm, i) in ARMS"
          :key="i"
          class="energy-orb__arm"
          :d="arm.d"
          :stroke-width="arm.width"
          :style="{ '--speed': arm.speed, '--direction': arm.direction }"
        />
      </g>
      <circle class="energy-orb__rim" r="38" />
      <ellipse class="energy-orb__highlight" cx="-17" cy="-19" rx="9" ry="5" transform="rotate(-40 -17 -19)" />
      <ellipse class="energy-orb__highlight energy-orb__highlight--small" cx="19" cy="20" rx="5" ry="2.6" transform="rotate(-30 19 20)" />
      <circle class="energy-orb__core" r="16" :fill="`url(#${coreId})`" :filter="`url(#${blurId})`" />
      <g class="energy-orb__sparks" :filter="`url(#${sparkBlurId})`" :opacity="sparksOpacity">
        <g v-for="(spark, i) in SPARKS" :key="i" :transform="`translate(${spark.x} ${spark.y}) rotate(${spark.glint})`">
          <g :transform="`scale(${spark.size} ${(spark.size * SPARK_ASPECT).toFixed(2)})`">
            <path
              class="energy-orb__spark"
              :d="SPARK_PATH"
              :style="{ '--period': `${spark.period}s`, '--delay': `${-spark.delay}s` }"
            />
          </g>
        </g>
      </g>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'

const props = withDefaults(defineProps<{
  // Степень накопления энергии: 0 — покой (≈9px), 1 — отрыв (≈36px при размере 40px)
  energy?: number
  // Пульсация: энергия плавно качается от energy до PULSE_MAX_ENERGY, вихрь то замедляется, то разгоняется
  pulse?: boolean
  // CSS-размер SVG-области; если не задан, размер задаёт родитель (например, атрибуты width/height внутри сцены)
  size?: string
}>(), {
  energy: 0,
  pulse: false,
  size: undefined,
})

const PULSE_MAX_ENERGY = 1
const PULSE_PERIOD_S = 4

// Диаметр сферы как доля области: от покоя до отрыва
const DIAMETER_MIN_RATIO = 0.22
const DIAMETER_MAX_RATIO = 0.9
// Геометрия слоёв нарисована для радиуса 40 в области 100×100 — отсюда коэффициент масштаба
const REFERENCE_RADIUS = 40
const VIEW_SIZE = 100
const MIN_SPIN_S = 1
const MAX_SPIN_S = 8
// Искры расставлены по кругу с детерминированными фазами: мерцают вразнобой, но без случайности при SSR
const SPARK_COUNT = 9
const SPARK_RADIUS_MIN = 46
const SPARK_RADIUS_SPREAD = 9
const SPARK_SIZES = [2.6, 3.4, 2.2, 3, 2.4]
// Блик: тонкий четырёхлучевой ромб единичного размера; по второй оси его сжимает SPARK_ASPECT
const SPARK_PATH = 'M 0 -1 C 0.12 -0.12 0.12 -0.12 1 0 C 0.12 0.12 0.12 0.12 0 1 C -0.12 0.12 -0.12 0.12 -1 0 C -0.12 -0.12 -0.12 -0.12 0 -1 Z'
const SPARK_ASPECT = 0.4
const SPARK_PERIODS_S = [1.1, 1.7, 1.3, 2.1, 1.5]
const SPARK_DELAY_STEP_S = 0.37
const SPARK_DELAY_CYCLE_S = 2

const SPARKS = Array.from({ length: SPARK_COUNT }, (_, index) => {
  const angle = (index / SPARK_COUNT) * 2 * Math.PI + 0.3
  const radius = SPARK_RADIUS_MIN + ((index * 5) % SPARK_RADIUS_SPREAD)
  return {
    x: Number((radius * Math.cos(angle)).toFixed(2)),
    y: Number((radius * Math.sin(angle)).toFixed(2)),
    size: SPARK_SIZES[index % SPARK_SIZES.length] ?? 1.5,
    glint: ((index * 47) % 90) - 45,
    period: SPARK_PERIODS_S[index % SPARK_PERIODS_S.length] ?? 1.5,
    delay: (index * SPARK_DELAY_STEP_S) % SPARK_DELAY_CYCLE_S,
  }
})

// Рукава вихря: спирали, расходящиеся из центра; у каждого свои ширина, длина, скорость и направление
const ARM_COUNT = 5
const ARM_STEPS = 16
const ARM_TWIST_RAD = 2.4
const ARM_REACH = [34, 38, 32, 37, 35]
const ARM_WIDTHS = [3, 4.5, 2.5, 4, 3.5]
const ARM_SPEEDS = [1, 1.3, 0.8, 1.15, 0.9]

function buildArmPath(index: number, reach: number) {
  const startAngle = (index / ARM_COUNT) * 2 * Math.PI
  const points = Array.from({ length: ARM_STEPS + 1 }, (_, step) => {
    const t = step / ARM_STEPS
    const angle = startAngle + ARM_TWIST_RAD * t
    const radius = reach * t
    return `${step === 0 ? 'M' : 'L'} ${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`
  })
  return points.join(' ')
}

const ARMS = Array.from({ length: ARM_COUNT }, (_, index) => ({
  d: buildArmPath(index, ARM_REACH[index] ?? ARM_REACH[0]!),
  width: ARM_WIDTHS[index] ?? ARM_WIDTHS[0]!,
  speed: ARM_SPEEDS[index] ?? 1,
  direction: index % 2 === 0 ? 'normal' : 'reverse',
}))

const shellId = `energy-orb-shell-${useId()}`
const glowId = `energy-orb-glow-${useId()}`
const coreId = `energy-orb-core-${useId()}`
const blurId = `energy-orb-blur-${useId()}`
const glowBlurId = `energy-orb-glow-blur-${useId()}`
const sparkBlurId = `energy-orb-spark-blur-${useId()}`

const pulsedEnergy = ref(props.energy)
let frameId = 0

const energy = computed(() => (props.pulse ? pulsedEnergy.value : Math.min(Math.max(props.energy, 0), 1)))

function animatePulse(now: number) {
  const phase = (now / 1000) * (2 * Math.PI) / PULSE_PERIOD_S
  const wave = 0.5 + 0.5 * Math.sin(phase)
  pulsedEnergy.value = props.energy + (PULSE_MAX_ENERGY - props.energy) * wave
  frameId = requestAnimationFrame(animatePulse)
}

onMounted(() => {
  if (!props.pulse || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  frameId = requestAnimationFrame(animatePulse)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
})

const bodyScale = computed(() => {
  const diameterRatio = DIAMETER_MIN_RATIO + (DIAMETER_MAX_RATIO - DIAMETER_MIN_RATIO) * energy.value
  return Number((diameterRatio * VIEW_SIZE / (2 * REFERENCE_RADIUS)).toFixed(3))
})

const glowOpacity = computed(() => (0.7 + 0.3 * energy.value).toFixed(2))

const sparksOpacity = computed(() => (0.6 + 0.4 * energy.value).toFixed(2))

// Чем больше энергии, тем быстрее вихрь
const spinDuration = computed(() => `${(MAX_SPIN_S - (MAX_SPIN_S - MIN_SPIN_S) * energy.value).toFixed(2)}s`)
</script>

<style scoped lang="scss">
.energy-orb {
  display: block;
  overflow: visible;
  pointer-events: none;

  &__body {
    transform-origin: 0 0;
    transition: transform 0.25s linear;
  }

  &__glow,
  &__shell,
  &__core {
    transform-origin: 0 0;
  }

  &__glow {
    animation: energy-orb-breathe 2.4s ease-in-out infinite;
  }

  &__vortex {
    transform-origin: 0 0;
  }

  &__arm {
    fill: none;
    stroke: #8DEBFF;
    stroke-linecap: round;
    opacity: 0.85;
    transform-origin: 0 0;
    animation: energy-orb-spin calc(var(--spin) * var(--speed)) linear infinite var(--direction);
  }

  .energy-orb__vortex--glow .energy-orb__arm {
    stroke: #53CFFF;
    opacity: 0.6;
  }

  &__rim {
    fill: none;
    stroke: #BFF4FF;
    stroke-width: 1.5;
    opacity: 0.7;
  }

  &__highlight {
    fill: #FFFFFF;
    opacity: 0.7;
    filter: blur(1px);
  }

  &__highlight--small {
    opacity: 0.5;
  }

  &__core {
    animation: energy-orb-pulse 1.8s ease-in-out infinite;
  }

  &__spark {
    fill: #53CFFF;
    transform-box: fill-box;
    transform-origin: center;
    animation: energy-orb-spark var(--period) ease-in-out infinite;
    animation-delay: var(--delay);
  }
}

@keyframes energy-orb-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes energy-orb-breathe {
  0%,
  100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}

@keyframes energy-orb-pulse {
  0%,
  100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

@keyframes energy-orb-spark {
  0%,
  100% { opacity: 0.05; transform: scale(0.5); }
  40% { opacity: 1; transform: scale(1.4); }
  55% { opacity: 0.4; transform: scale(0.9); }
  70% { opacity: 1; transform: scale(1.1); }
}

@media (prefers-reduced-motion: reduce) {
  .energy-orb__glow,
  .energy-orb__arm,
  .energy-orb__core,
  .energy-orb__spark {
    animation: none;
  }
}
</style>
