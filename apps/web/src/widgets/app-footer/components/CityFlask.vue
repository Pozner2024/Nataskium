<template>
  <div class="city-flask__liquid" />
  <div v-for="bubble in bubbles" :key="bubble.index" class="city-flask__bubble-lane" :style="bubble.laneStyle">
    <span class="city-flask__bubble" :style="bubble.style" />
  </div>
</template>

<script setup lang="ts">
import { FLASK_BOTTOM_X, FLASK_BOTTOM_Y, FLASK_NECK_X, FLASK_NECK_Y } from '../cityLayout'
import { createRandomBetween } from '../sceneRandom'

const RANDOM_SEED = 41
const BUBBLE_COUNT = 9
const NECK_SPREAD_X = 0.3

const between = createRandomBetween(RANDOM_SEED)

const bubbles = Array.from({ length: BUBBLE_COUNT }, (_, index) => {
  const startX = between(...FLASK_BOTTOM_X)
  const startY = between(...FLASK_BOTTOM_Y)
  const duration = between(2.6, 4.4)
  return {
    index,
    laneStyle: {
      '--dx': `${FLASK_NECK_X + between(-NECK_SPREAD_X, NECK_SPREAD_X) - startX}%`,
      '--dy': `${between(...FLASK_NECK_Y) - startY}%`,
      animationDuration: `${duration}s`,
      animationDelay: `${-between(0, duration)}s`,
    },
    style: {
      left: `${startX}%`,
      top: `${startY}%`,
      width: `${between(0.25, 0.55)}%`,
    },
  }
})
</script>

<style scoped lang="scss">
// По жидкости в колбе вверх-вниз ходит перелив света
.city-flask__liquid {
  position: absolute;
  top: 54.6%;
  left: 56.4%;
  width: 4.2%;
  height: 9.2%;
  clip-path: polygon(24% 0, 76% 0, 100% 100%, 0 100%);
  // Верх трапеции растворяется: иначе полоса света, дойдя до него, упирается в ровный край
  // и выглядит как плоский полупрозрачный слой поверх колбы
  mask-image: linear-gradient(to bottom, transparent, #000 55%);
  mix-blend-mode: screen;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 250%;
    background: linear-gradient(180deg, transparent 30%, rgb(var(--rgb-cool-light) / 0.55) 45%, transparent 60%);
    animation: slosh 3.5s ease-in-out infinite alternate;
  }
}

@keyframes slosh {
  from { transform: translateY(-60%); }
  to { transform: translateY(0); }
}

// Пузырёк поднимается со дна конуса к горлышку. Слой во всю сцену, чтобы сдвиг считался в процентах сцены
.city-flask__bubble-lane {
  position: absolute;
  inset: 0;
  opacity: 0;
  animation: bubble-rise ease-in infinite;
}

.city-flask__bubble {
  position: absolute;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, var(--color-white), rgb(var(--rgb-cool-light) / 0.85) 55%, rgb(var(--rgb-cool-light) / 0.3));
  translate: -50% -50%;
}

@keyframes bubble-rise {
  0% { transform: translate(0, 0); opacity: 0; }
  15% { opacity: 1; }
  80% { opacity: 0.9; }
  100% { transform: translate(var(--dx), var(--dy)); opacity: 0; }
}
</style>
