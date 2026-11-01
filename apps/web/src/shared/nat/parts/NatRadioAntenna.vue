<template>
  <g :transform="`rotate(${(angle * SWING_DEG).toFixed(2)} ${BASE.x} ${BASE.y})`">
    <NatAntennaCap />
    <line :x1="BASE.x" y1="136" :x2="BASE.x" :y2="tip" stroke="#A7B0C8" stroke-width="5" stroke-linecap="round" />
    <line x1="253" y1="132" x2="253" :y2="tip + 4" stroke="#fff" stroke-width="1.2" opacity=".5" />
    <g fill="none" :stroke="waveColor" stroke-width="3.5" stroke-linecap="round">
      <path v-for="wave in waves" :key="wave.key" :d="wave.d" :stroke-opacity="wave.opacity" />
    </g>
    <NatAntennaBall :cx="BASE.x" :cy="tip" :radius="BALL_RADIUS" :flash="flash" :ball-id="ballId" :halo-id="haloId" />
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import NatAntennaBall from './NatAntennaBall.vue'
import NatAntennaCap from './NatAntennaCap.vue'

const BASE = { x: 255, y: 137 }
const LENGTH = 74
const BALL_RADIUS = 10
const SWING_DEG = 40
const WAVE_COUNT = 3
const WAVE_RATE = 0.7
const WAVE_MIN_RADIUS = 14
const WAVE_GROWTH = 34

const props = defineProps<{
  angle: number
  stretch: number
  flash: number
  time: number
  waveColor: string
  ballId: string
  haloId: string
}>()

const tip = computed(() => BASE.y - LENGTH * props.stretch)

const waves = computed(() => Array.from({ length: WAVE_COUNT }, (_, index) => {
  const progress = (props.time * WAVE_RATE + index / WAVE_COUNT) % 1
  const radius = WAVE_MIN_RADIUS + progress * WAVE_GROWTH
  const y = tip.value - radius * 0.5
  return {
    key: index,
    d: `M${BASE.x - radius * 0.8} ${y} A${radius} ${radius} 0 0 1 ${BASE.x + radius * 0.8} ${y}`,
    opacity: ((1 - progress) * (0.55 + props.flash * 0.45)).toFixed(2),
  }
}))
</script>
