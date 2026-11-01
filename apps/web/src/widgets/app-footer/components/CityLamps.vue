<template>
  <span v-for="lamp in lamps" :key="lamp.key" class="city-lamps__glow" :style="lamp.style" />
</template>

<script setup lang="ts">
import { LAMPS } from '../cityLayout'
import { createRandomBetween } from '../sceneRandom'

const RANDOM_SEED = 53

const between = createRandomBetween(RANDOM_SEED)

const lamps = LAMPS.map(({ x, y, glowSize }) => {
  const duration = between(10, 24)
  return {
    key: `${x}-${y}`,
    style: {
      left: `${x}%`,
      top: `${y}%`,
      width: `${glowSize}%`,
      '--duration': `${duration}s`,
      '--delay': `${-between(0, duration)}s`,
    },
  }
})
</script>

<style scoped lang="scss">
.city-lamps__glow {
  position: absolute;
  aspect-ratio: 1;
  translate: -50% -50%;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgb(var(--rgb-star-light)) 0 7%,
      rgb(var(--rgb-lamp-light) / 0.85) 20%,
      rgb(var(--rgb-lamp-light) / 0.35) 42%,
      transparent 70%
    );
    mix-blend-mode: screen;
    animation: lamp-light var(--duration) linear var(--delay) infinite;
  }
}

@keyframes lamp-light {
  0%,
  84% { opacity: 1; }
  85%,
  93% { opacity: 0; }
  94% { opacity: 0.8; }
  95% { opacity: 0; }
  96.5%,
  100% { opacity: 1; }
}
</style>
