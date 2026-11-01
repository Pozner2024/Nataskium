<template>
  <button ref="root" class="nat-robot" :class="{ 'nat-robot--paused': isPaused }" type="button" :aria-label="label" :style="{ width: `calc(var(--nat-unit) * ${viewBoxWidth})` }" @click="onClick">
    <svg ref="svg" class="nat-robot__svg" :viewBox="viewBox" aria-hidden="true">
      <defs>
        <slot name="defs" />
      </defs>

      <slot name="scene" />

      <g class="nat-robot__float">
        <NatFigure
          ref="figure"
          :gaze="gaze"
          :eye-color="eyeColor"
          :glow-color="glowColor"
          :body-filter="bodyFilter"
        >
          <template #back><slot name="back" /></template>
          <template #overlay><slot name="overlay" /></template>
          <template #glasses><slot name="glasses" /></template>
          <template #front><slot name="front" /></template>
        </NatFigure>
      </g>
    </svg>
  </button>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useOffscreenPause } from '../lib'
import NatFigure from './NatFigure.vue'
import { aimAt, easeGaze, NO_GAZE, useSvgPointer } from './lib/gaze'
import { useFrameLoop } from './lib/useFrameLoop'

const HEAD_CENTER = { x: 255, y: 288 }
const GAZE_REACH = 260
const HAPPY_DURATION_MS = 1500

const props = withDefaults(
  defineProps<{
    label: string
    viewBox?: string
    followsCursor?: boolean
    manualJoy?: boolean
    joyDurationMs?: number
    eyeColor?: string
    glowColor?: string
    bodyFilter?: string
  }>(),
  { viewBox: '0 0 520 520', joyDurationMs: HAPPY_DURATION_MS },
)

const emit = defineEmits<{
  press: []
}>()

const viewBoxWidth = computed(() => Number(props.viewBox.split(' ')[2]))

const root = ref<HTMLButtonElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const figure = ref<InstanceType<typeof NatFigure> | null>(null)
const gaze = shallowRef(NO_GAZE)
const { isPaused } = useOffscreenPause(root)

if (props.followsCursor) {
  const getPointer = useSvgPointer(svg)
  const loop = useFrameLoop(() => {
    const pointer = getPointer()
    const goal = pointer ? aimAt(HEAD_CENTER, pointer, GAZE_REACH) : NO_GAZE
    gaze.value = easeGaze(gaze.value, goal, loop.isReducedMotion())
  }, { isAlwaysOn: true })
}

function rejoice(durationMs = props.joyDurationMs) {
  figure.value?.rejoice(durationMs)
}

function calm() {
  figure.value?.calm()
}

function onClick() {
  if (!props.manualJoy) rejoice()
  emit('press')
}

defineExpose({ rejoice, calm })
</script>

<style scoped lang="scss">
.nat-robot {
  display: block;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 2px solid var(--focus-color);
    outline-offset: 8px;
    border-radius: 24px;
  }

  &--paused,
  &--paused :deep(*) {
    animation-play-state: paused !important;
  }

  &__svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  &__float {
    transform-box: view-box;
    transform-origin: 50% 55%;
    animation: nat-float 3.2s ease-in-out infinite alternate;
  }
}

@keyframes nat-float {
  from {
    transform: translateY(6px) rotate(1.5deg);
  }

  to {
    transform: translateY(-10px) rotate(-2deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nat-robot__float {
    animation: none;
  }
}
</style>
