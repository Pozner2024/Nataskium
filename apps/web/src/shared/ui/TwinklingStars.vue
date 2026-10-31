<template>
  <span
    v-for="star in stars"
    :key="star.key"
    class="twinkling-stars__star"
    :class="{ 'twinkling-stars__star--small': star.isSmall }"
    :style="star.style"
  />
</template>

<script setup lang="ts">
import { createSeededRandom } from '../lib'
import type { StarPoint } from './types'

const props = defineProps<{
  bigStars: StarPoint[]
  smallStars: StarPoint[]
  // Задержки и длительности должны совпасть на сервере и в браузере, иначе гидрация SSR не сойдётся
  seed: number
}>()

const MAX_DELAY_S = 7

const random = createSeededRandom(props.seed)
const between = (min: number, max: number) => min + random() * (max - min)

function toStar([x, y]: StarPoint, isSmall: boolean) {
  const duration = isSmall ? between(2.5, 6) : between(3, 7)
  return {
    key: `${x}-${y}`,
    isSmall,
    style: {
      left: `${x}%`,
      top: `${y}%`,
      animationDuration: `${duration}s`,
      animationDelay: `${-between(0, MAX_DELAY_S)}s`,
    },
  }
}

const stars = [
  ...props.bigStars.map((point) => toStar(point, false)),
  ...props.smallStars.map((point) => toStar(point, true)),
]
</script>

<style scoped lang="scss">
// Звёзды почти всё время горят тускло, потом резко вспыхивают и гаснут.
// Крупные — с лучами-крестиком, мелкие — точки.
// Размер по умолчанию — доля ширины родителя; задаётся снаружи через --star-size и --star-small-size
.twinkling-stars__star {
  position: absolute;
  width: var(--star-size, 2.2%);
  aspect-ratio: 1;
  background:
    radial-gradient(circle, var(--color-white) 0 5%, rgb(var(--rgb-star-light) / 0.7) 14%, transparent 40%),
    linear-gradient(90deg, transparent, rgb(var(--rgb-star-light) / 0.6) 50%, transparent) center / 100% 5% no-repeat,
    linear-gradient(0deg, transparent, rgb(var(--rgb-star-light) / 0.6) 50%, transparent) center / 5% 100% no-repeat;
  opacity: 0.3;
  translate: -50% -50%;
  scale: 0.65;
  animation: twinkle linear infinite;
}

.twinkling-stars__star--small {
  width: var(--star-small-size, 0.8%);
  background: radial-gradient(circle, var(--color-white) 0 12%, rgb(var(--rgb-star-light) / 0.6) 30%, transparent 65%);
  opacity: 0.15;
  animation-name: twinkle-small;
}

@keyframes twinkle {
  0%,
  70% { opacity: 0.3; scale: 0.65; rotate: 0deg; }
  74% { opacity: 1; scale: 1.15; rotate: 10deg; }
  82%,
  100% { opacity: 0.3; scale: 0.65; rotate: 0deg; }
}

@keyframes twinkle-small {
  0%,
  75% { opacity: 0.15; scale: 0.7; }
  78% { opacity: 1; scale: 1.2; }
  84%,
  100% { opacity: 0.15; scale: 0.7; }
}

@media (prefers-reduced-motion: reduce) {
  .twinkling-stars__star {
    animation: none;
  }
}
</style>
