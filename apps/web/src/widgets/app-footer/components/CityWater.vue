<template>
  <div v-for="wave in waves" :key="wave.index" class="city-water__wave" :style="wave.style">
    <img class="city-water__wave-image" :src="waterImage" alt="" loading="lazy" :style="{ top: `${-wave.index * 100}%` }">
  </div>
  <div class="city-water__ripple" />
  <span v-for="glint in glints" :key="glint.index" class="city-water__glint" :style="glint.style" />
</template>

<script setup lang="ts">
import { ARCH_LIGHTS_X, WATER_HEIGHT, WATER_TOP } from '../cityLayout'
import waterImage from '../images/water.webp'
import { createRandomBetween } from '../sceneRandom'

const RANDOM_SEED = 23
// Полоса воды режется на слои, нижние (ближние к зрителю) качаются сильнее
const WAVE_SLICES = 8
const WAVE_BASE_AMPLITUDE = 0.12
const WAVE_AMPLITUDE_STEP = 0.04
const GLINT_COUNT = 16
const GLINT_SPREAD_X = 1.2
const GLINT_TOP: [number, number] = [80.3, 83.3]

const between = createRandomBetween(RANDOM_SEED)
const sliceHeight = WATER_HEIGHT / WAVE_SLICES

const waves = Array.from({ length: WAVE_SLICES }, (_, index) => ({
  index,
  style: {
    top: `${WATER_TOP + index * sliceHeight}%`,
    height: `${sliceHeight}%`,
    '--amplitude': `${WAVE_BASE_AMPLITUDE + index * WAVE_AMPLITUDE_STEP}%`,
    animationDuration: `${1.4 + (index % 3) * 0.35}s`,
    animationDelay: `${-index * 0.3}s`,
  },
}))

const glints = Array.from({ length: GLINT_COUNT }, (_, index) => {
  const lightX = ARCH_LIGHTS_X[index % ARCH_LIGHTS_X.length] ?? 0
  const duration = between(1.8, 3.6)
  return {
    index,
    style: {
      left: `${lightX + between(-GLINT_SPREAD_X, GLINT_SPREAD_X)}%`,
      top: `${between(...GLINT_TOP)}%`,
      animationDuration: `${duration}s`,
      animationDelay: `${-between(0, duration)}s`,
    },
  }
})
</script>

<style scoped lang="scss">
// Полоски воды качаются вбок с разной фазой — отражения огней «плывут»
.city-water__wave {
  position: absolute;
  left: 0;
  width: 100%;
  overflow: hidden;
  // по краям в воде стоят кусты и фонари — их не качаем
  mask-image: linear-gradient(90deg, transparent 17%, #000 21%, #000 83%, transparent 87%);
  animation: wave ease-in-out infinite alternate;
}

.city-water__wave-image {
  position: absolute;
  left: 0;
  width: 100%;
}

@keyframes wave {
  from { transform: translateX(calc(var(--amplitude) * -1)); }
  to { transform: translateX(var(--amplitude)); }
}

// Рябь двигается через transform: это делает видеокарта, без перерисовки каждый кадр
.city-water__ripple {
  position: absolute;
  top: 79.5%;
  left: 12%;
  width: 76%;
  height: 13%;
  overflow: hidden;
  mask-image: radial-gradient(ellipse at 50% 40%, #000 30%, transparent 75%);

  &::before {
    content: '';
    position: absolute;
    top: -24px;
    left: 0;
    width: 100%;
    height: calc(100% + 24px);
    background: repeating-linear-gradient(180deg, transparent 0 5px, rgb(var(--rgb-cool-light) / 0.22) 5px 6px);
    animation: ripple 4s linear infinite;
  }
}

@keyframes ripple {
  to { transform: translateY(24px); }
}

// Короткие блики в отражениях огней под арками
.city-water__glint {
  position: absolute;
  width: 2.4%;
  height: 0.5%;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgb(var(--rgb-star-light) / 0.95), rgb(var(--rgb-lamp-light) / 0.4) 45%, transparent 75%);
  opacity: 0;
  translate: -50% -50%;
  animation: glint ease-in-out infinite;
}

@keyframes glint {
  0%,
  100% { opacity: 0; scale: 0.3 1; }
  50% { opacity: 1; scale: 1.2 1; }
}
</style>
