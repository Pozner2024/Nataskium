<template>
  <g ref="root" class="nat-figure" :style="eyeColor ? { '--nat-eye': eyeColor } : undefined">
    <defs>
      <radialGradient :id="ids.visor" cx="38%" cy="30%" r="80%">
        <stop offset="0" stop-color="#2B3150" />
        <stop offset=".55" stop-color="#0B0E1C" />
        <stop offset="1" stop-color="#03040A" />
      </radialGradient>
      <linearGradient :id="ids.bezel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFFFFF" />
        <stop offset=".6" stop-color="#E6EAF4" />
        <stop offset="1" stop-color="#B9C3DA" />
      </linearGradient>
      <filter :id="ids.eyeGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
        <feFlood :flood-color="glowColor" />
        <feComposite in2="b" operator="in" result="g" />
        <feMerge>
          <feMergeNode in="g" />
          <feMergeNode in="g" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <g :transform="leanTransform">
      <slot name="back" />

      <image
        class="nat-figure__body"
        :href="bodyImage"
        x="105"
        y="135"
        width="300"
        height="291"
        :style="bodyFilter ? { filter: bodyFilter } : undefined"
      />

      <slot name="overlay" />

      <g class="nat-figure__face">
        <g :transform="lookTransform">
          <ellipse cx="290" cy="275" rx="104" ry="90" :fill="`url(#${ids.bezel})`" />
          <ellipse cx="293" cy="278" rx="90" ry="76" :fill="`url(#${ids.visor})`" />
          <ellipse cx="262" cy="230" rx="42" ry="14" fill="#fff" opacity=".16" />
          <ellipse cx="337" cy="320" rx="22" ry="7" fill="#9DB8FF" opacity=".1" />
          <g :filter="`url(#${ids.eyeGlow})`" :transform="eyesTransform">
            <g ref="eyesOpen" class="nat-figure__eyes-open">
              <rect class="nat-figure__eye" x="260" y="256" width="14" height="46" rx="7" />
              <rect class="nat-figure__eye" x="316" y="256" width="14" height="46" rx="7" />
            </g>
            <g class="nat-figure__eyes-happy">
              <path d="M251 287 Q267 263 283 287" />
              <path d="M307 287 Q323 263 339 287" />
            </g>
          </g>
          <g :transform="eyesTransform">
            <slot name="glasses" />
          </g>
        </g>
      </g>

      <slot name="front" />
    </g>
  </g>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'
import bodyImage from './images/body-front.png'
import { NO_GAZE, type Point } from './lib/gaze'

const BLINK_MIN_DELAY_MS = 1800
const BLINK_RANDOM_DELAY_MS = 3200
const DOUBLE_BLINK_CHANCE = 0.25
const DOUBLE_BLINK_GAP_MS = 260
const HEAD_CENTER = { x: 255, y: 288 }
const VISOR_CENTER = { x: 255, y: 283 }
const VISOR_REST = { x: -35, y: 8 }
const VISOR_SHIFT = { x: 46, y: 34 }
const EYES_SHIFT = { x: 18, y: 13 }
const VISOR_SQUEEZE = { x: 0.18, y: 0.12 }
const LEAN_DEG = 12

const props = withDefaults(
  defineProps<{
    gaze?: Point
    eyeColor?: string
    glowColor?: string
    bodyFilter?: string
  }>(),
  { gaze: () => NO_GAZE, glowColor: '#4FA3FF' },
)

const root = ref<SVGGElement | null>(null)
const eyesOpen = ref<SVGGElement | null>(null)

const uid = useId()
const ids = {
  visor: `${uid}-visor`,
  bezel: `${uid}-bezel`,
  eyeGlow: `${uid}-eye-glow`,
}

const leanTransform = computed(() => `rotate(${props.gaze.x * LEAN_DEG} ${HEAD_CENTER.x} ${HEAD_CENTER.y})`)

const lookTransform = computed(() => {
  const { x, y } = props.gaze
  const scaleX = 1 - Math.abs(x) * VISOR_SQUEEZE.x
  const scaleY = 1 - Math.abs(y) * VISOR_SQUEEZE.y
  return `translate(${VISOR_REST.x + x * VISOR_SHIFT.x} ${VISOR_REST.y + y * VISOR_SHIFT.y}) `
    + `translate(${VISOR_CENTER.x} ${VISOR_CENTER.y}) scale(${scaleX} ${scaleY}) translate(${-VISOR_CENTER.x} ${-VISOR_CENTER.y})`
})

const eyesTransform = computed(() => `translate(${props.gaze.x * EYES_SHIFT.x} ${props.gaze.y * EYES_SHIFT.y})`)

let blinkTimer: ReturnType<typeof setTimeout> | undefined
let doubleBlinkTimer: ReturnType<typeof setTimeout> | undefined
let happyTimer: ReturnType<typeof setTimeout> | undefined

// Классы ставятся напрямую, чтобы CSS-анимация перезапускалась при каждом вызове
function restartClass(el: Element, className: string) {
  el.classList.remove(className)
  void el.getBoundingClientRect()
  el.classList.add(className)
}

function blink() {
  if (!eyesOpen.value) return
  restartClass(eyesOpen.value, 'nat-figure__eyes-open--blink')
}

function scheduleBlink() {
  blinkTimer = setTimeout(() => {
    blink()
    if (Math.random() < DOUBLE_BLINK_CHANCE) {
      doubleBlinkTimer = setTimeout(blink, DOUBLE_BLINK_GAP_MS)
    }
    scheduleBlink()
  }, BLINK_MIN_DELAY_MS + Math.random() * BLINK_RANDOM_DELAY_MS)
}

function rejoice(durationMs: number) {
  if (!root.value) return
  restartClass(root.value, 'nat-figure--happy')
  clearTimeout(happyTimer)
  happyTimer = setTimeout(calm, durationMs)
}

function calm() {
  clearTimeout(happyTimer)
  root.value?.classList.remove('nat-figure--happy')
}

onMounted(scheduleBlink)

onUnmounted(() => {
  clearTimeout(blinkTimer)
  clearTimeout(doubleBlinkTimer)
  clearTimeout(happyTimer)
})

defineExpose({ rejoice, calm })
</script>

<style scoped lang="scss">
.nat-figure {
  --nat-eye: #cfeaff;

  &__body {
    filter: drop-shadow(0 0 18px rgb(170 200 255 / 0.45)) drop-shadow(0 18px 22px rgb(40 70 120 / 0.28));
  }

  &__face {
    transform-box: fill-box;
    transform-origin: center;
  }

  &__eye {
    fill: var(--nat-eye);
    transform-box: fill-box;
    transform-origin: center;
  }

  &__eyes-open--blink &__eye {
    animation: nat-blink 0.17s ease-in-out;
  }

  &__eyes-happy {
    fill: none;
    stroke: var(--nat-eye);
    stroke-width: 8;
    stroke-linecap: round;
    opacity: 0;
  }

  &--happy &__eyes-open {
    opacity: 0;
  }

  &--happy &__eyes-happy {
    opacity: 1;
  }

  &--happy &__face {
    animation: nat-hop 0.5s cubic-bezier(0.3, 1.6, 0.5, 1);
  }
}

@keyframes nat-blink {
  50% {
    transform: scaleY(0.08);
  }
}

@keyframes nat-hop {
  40% {
    transform: translateY(-10px) scale(1.04);
  }
}
</style>
