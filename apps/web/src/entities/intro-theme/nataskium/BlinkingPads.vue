<template>
  <!-- Фон игры: площадки узора платы по одной вспыхивают неоновым цветом. Точки — HTML-элементы:
       их opacity анимирует видеокарта, страница не перерисовывается каждый кадр -->
  <div class="blinking-pads" aria-hidden="true">
    <span
      v-for="(pad, index) in pads"
      :key="index"
      class="blinking-pads__pad"
      :style="{
        left: `${pad.x}px`,
        top: `${pad.y}px`,
        background: neon[index % neon.length],
        '--pad-delay': `${(index * CYCLE_S) / pads.length}s`,
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IntroThemeTone } from '../types'
import { PCB_PADS, PCB_PATTERN_SIZE } from './pcbPads'

// Размер плитки узора на экране — $board-tile-size в mixins.scss
const BOARD_TILE_PX = 320
const PAD_COUNT = 12
const CYCLE_S = 12
// Узор виден в углах сцены (маска .nataskium-scene__pcb): правый верхний и левый нижний эллипсы 70% × 60%
const ZONE = { width: 0.7, height: 0.6, minWeight: 0.35 }

const props = defineProps<{
  width: number
  height: number
  tone: IntroThemeTone
}>()

// Неоновые версии трёх точек окна карточки: зелёная, оранжевая, синяя. На светлом фоне неон не виден — там насыщенные тёмные
const NEON: Record<IntroThemeTone, readonly string[]> = {
  dark: ['#8dff5c', '#ffa94d', '#5ce1ff'],
  light: ['#3f8f1f', '#d9731a', '#2549c5'],
}

const neon = computed(() => NEON[props.tone])

function zoneWeight(x: number, y: number): number {
  const corner = (cx: number, cy: number) =>
    1 - Math.hypot((x - cx) / (props.width * ZONE.width), (y - cy) / (props.height * ZONE.height))
  return Math.max(corner(props.width, 0), corner(0, props.height))
}

// Детерминированное «случайное» число по координатам: при каждом показе мигают одни и те же площадки
function scatter(x: number, y: number): number {
  return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1
}

const pads = computed(() => {
  const scale = BOARD_TILE_PX / PCB_PATTERN_SIZE
  const visible: { x: number; y: number; order: number }[] = []
  for (let tileY = 0; tileY < props.height; tileY += BOARD_TILE_PX) {
    for (let tileX = 0; tileX < props.width; tileX += BOARD_TILE_PX) {
      for (const [padX, padY] of PCB_PADS) {
        const x = tileX + padX * scale
        const y = tileY + padY * scale
        if (x > props.width || y > props.height || zoneWeight(x, y) < ZONE.minWeight) continue
        visible.push({ x, y, order: scatter(x, y) })
      }
    }
  }
  return visible.sort((a, b) => a.order - b.order).slice(0, PAD_COUNT)
})
</script>

<style scoped lang="scss">
$pad-size: 8px;

// Цикл 12 с на все площадки; каждая вспыхивает в свою долю цикла
$cycle: 12s;

.blinking-pads {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.blinking-pads__pad {
  position: absolute;
  width: $pad-size;
  height: $pad-size;
  margin: calc(#{$pad-size} / -2) 0 0 calc(#{$pad-size} / -2);
  border-radius: 50%;
  opacity: 0;
  will-change: opacity;
  animation: blinking-pad $cycle ease-in-out infinite;
  animation-delay: var(--pad-delay);
}

@keyframes blinking-pad {
  0%,
  100% {
    opacity: 0;
  }

  5% {
    opacity: 1;
  }

  16% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .blinking-pads {
    display: none;
  }
}
</style>
