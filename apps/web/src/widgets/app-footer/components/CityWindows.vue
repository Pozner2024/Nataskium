<template>
  <span v-for="patch in skyscraperWindows" :key="patch.key" class="city-windows__patch" :style="patch.style" />
  <img
    v-for="archWindow in archWindows"
    :key="archWindow.image"
    class="city-windows__arch"
    :class="{ 'city-windows__arch--lights-on': archWindow.isLightsOn }"
    :src="archWindow.src"
    alt=""
    loading="lazy"
    :style="archWindow.style"
  >
</template>

<script setup lang="ts">
import { ARCH_WINDOWS, SKYSCRAPER_WINDOWS } from '../cityLayout'
import { createRandomBetween } from '../sceneRandom'

const RANDOM_SEED = 37

const between = createRandomBetween(RANDOM_SEED)
const WINDOW_IMAGES = import.meta.glob<string>('../images/win-*.webp', { eager: true, import: 'default' })

const skyscraperWindows = SKYSCRAPER_WINDOWS.map(({ x, y, width, height, wallColor }) => {
  const duration = between(14, 30)
  return {
    key: `${x}-${y}`,
    style: {
      left: `${x}%`,
      top: `${y}%`,
      width: `${width}%`,
      height: `${height}%`,
      background: wallColor,
      animationDuration: `${duration}s`,
      animationDelay: `${-between(0, duration)}s`,
    },
  }
})

// У половинок одного окна общий ритм
const groupTiming = new Map<number, { duration: number, delay: number }>()
function getGroupTiming(group: number) {
  const known = groupTiming.get(group)
  if (known) return known
  const duration = between(9, 18)
  const timing = { duration, delay: -between(0, duration) }
  groupTiming.set(group, timing)
  return timing
}

const archWindows = ARCH_WINDOWS.map(({ image, x, y, width, group }) => {
  const { duration, delay } = getGroupTiming(group)
  return {
    image,
    src: WINDOW_IMAGES[`../images/${image}.webp`],
    // Нечётные группы обычно тёмные и иногда зажигаются, чётные — наоборот
    isLightsOn: group % 2 === 1,
    style: {
      left: `${x}%`,
      top: `${y}%`,
      width: `${width}%`,
      animationDuration: `${duration}s`,
      animationDelay: `${delay}s`,
    },
  }
})
</script>

<style scoped lang="scss">
// Мелкие окна небоскрёбов: заплатка цвета стены иногда «гасит» свет
.city-windows__patch {
  position: absolute;
  opacity: 0;
  animation: patch-light ease-in-out infinite;
}

@keyframes patch-light {
  0%,
  55% { opacity: 0; }
  60%,
  92% { opacity: 1; }
  97%,
  100% { opacity: 0; }
}

// Большие арочные окна: поверх лежит то же окно с «выключенным» светом
.city-windows__arch {
  position: absolute;
  opacity: 0;
  animation: window-off ease-in-out infinite;
}

.city-windows__arch--lights-on {
  animation-name: window-on;
}

@keyframes window-off {
  0%,
  60% { opacity: 0; }
  66%,
  90% { opacity: 1; }
  96%,
  100% { opacity: 0; }
}

// Окно стоит тёмным, потом зажигается с коротким миганием
@keyframes window-on {
  0%,
  60% { opacity: 1; }
  63% { opacity: 0.4; }
  65% { opacity: 0.8; }
  70%,
  92% { opacity: 0; }
  97%,
  100% { opacity: 1; }
}
</style>
