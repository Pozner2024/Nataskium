<template>
  <!-- Живой фон игры: блик по плате, мигающие площадки и импульсы по дорожкам.
       Лежит над затемнением проигрывателя, но под карточкой: иначе затемнение гасит цвета -->
  <div ref="root" class="nataskium-ambience" :class="`nataskium-ambience--${tone}`" aria-hidden="true">
    <div class="nataskium-ambience__glint">
      <div class="nataskium-ambience__glint-band"><div class="nataskium-ambience__glint-board" /></div>
    </div>
    <template v-if="size">
      <BlinkingPads :width="size.width" :height="size.height" :tone="tone" />
      <AmbientSignals :width="size.width" :height="size.height" :tone="tone" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import type { IntroThemeTone } from '../types'
import AmbientSignals from './AmbientSignals.vue'
import BlinkingPads from './BlinkingPads.vue'

defineProps<{
  tone: IntroThemeTone
}>()

const root = useTemplateRef<HTMLDivElement>('root')
const size = ref<{ width: number; height: number } | null>(null)
let resizeObserver: ResizeObserver | null = null

function measure() {
  if (!root.value) return
  const { width, height } = root.value.getBoundingClientRect()
  size.value = width > 0 && height > 0 ? { width, height } : null
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'undefined' || !root.value) return
  resizeObserver = new ResizeObserver(measure)
  resizeObserver.observe(root.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

$glint-cycle: 12s;
$glint-band-ratio: 0.4;
$glint-band-share: $glint-band-ratio * 100%;

.nataskium-ambience {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;

  // Блик над затемнением: тихий, чтобы не спорить с текстом вопроса
  &--dark {
    --ambience-glint-opacity: 0.35;
    --ambience-glint-brightness: 2.2;
  }

  &--light {
    --ambience-glint-opacity: 0.3;
    --ambience-glint-brightness: 1;
  }
}

// Блик: та же плата, только ярче, видна в наклонной полосе, которая проходит по узору
.nataskium-ambience__glint {
  position: absolute;
  inset: 0;

  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
}

// Полоса — окно шириной 40% контейнера с размытыми краями, едет слева направо.
// Узор внутри едет ровно обратно и стоит на месте относительно платы.
// Двигается только transform — его анимирует видеокарта, слой не перерисовывается каждый кадр
.nataskium-ambience__glint-band {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: $glint-band-share;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(105deg, transparent 15%, #000 50%, transparent 85%);
  mask-image: linear-gradient(105deg, transparent 15%, #000 50%, transparent 85%);
  will-change: transform;
  animation: nataskium-glint-band $glint-cycle ease-in-out infinite;
}

.nataskium-ambience__glint-board {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: calc(100% / #{$glint-band-ratio});
  opacity: var(--ambience-glint-opacity);
  background: url($board-pattern) 0 0 / #{$board-tile-size} auto repeat;
  filter: brightness(var(--ambience-glint-brightness));
  // Блик только в углах, где виден узор. Маска на самом узоре, а не на обёртке:
  // узор неподвижен относительно платы, и маска не заставляет перерисовывать слой каждый кадр
  -webkit-mask-image:
    radial-gradient(ellipse 95% 85% at 100% 0%, #000 0%, transparent 100%),
    radial-gradient(ellipse 95% 85% at 0% 100%, #000 0%, transparent 100%);
  mask-image:
    radial-gradient(ellipse 95% 85% at 100% 0%, #000 0%, transparent 100%),
    radial-gradient(ellipse 95% 85% at 0% 100%, #000 0%, transparent 100%);
  will-change: transform;
  animation: nataskium-glint-board $glint-cycle ease-in-out infinite;
}

// Полоса проходит от левого края за правый за первые 25% цикла (3 с), остальное время её нет.
// Сдвиг узора — тот же путь в обратную сторону, в процентах его ширины (она в 1 / $glint-band-ratio раз больше)
@keyframes nataskium-glint-band {
  0% {
    transform: translateX(-100%);
  }

  25%,
  100% {
    transform: translateX(calc(100% / #{$glint-band-ratio}));
  }
}

@keyframes nataskium-glint-board {
  0% {
    transform: translateX(#{$glint-band-ratio * 100%});
  }

  25%,
  100% {
    transform: translateX(-100%);
  }
}
</style>
