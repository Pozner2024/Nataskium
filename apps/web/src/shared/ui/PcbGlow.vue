<template>
  <div class="pcb-glow" aria-hidden="true">
    <div class="pcb-glow__trail" :style="{ maskImage: TRAIL_MASK, '-webkit-mask-image': TRAIL_MASK }" />
  </div>
</template>

<script setup lang="ts">
import { PCB_TRAIL_POINTS } from '../lib/pcbGlow'

// Пятно одной точки: размер и спад к краю — CSS-переменные слоя, координаты пишет initPcbGlow
function spot(x: string, y: string, alpha: number): string {
  return `radial-gradient(circle var(--pcb-spot-radius) at ${x} ${y}, `
    + `rgb(0 0 0 / ${alpha}) 0%, rgb(0 0 0 / calc(${alpha} * var(--pcb-spot-mid-share))) var(--pcb-spot-mid-at), transparent 100%)`
}

// Голова шлейфа непрозрачнее всего, каждая следующая точка следа тише. Слои маски складываются (mask-composite: add)
const TRAIL_MASK = [
  spot('var(--pcb-x, -1000px)', 'var(--pcb-y, -1000px)', 1),
  ...Array.from({ length: PCB_TRAIL_POINTS }, (_, index) =>
    spot(`var(--pcb-trail-${index}-x, -1000px)`, `var(--pcb-trail-${index}-y, -1000px)`, 1 - (index + 1) / (PCB_TRAIL_POINTS + 1)),
  ),
].join(', ')
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

// Шлейф за курсором в блоке с миксином board-zones и атрибутом data-pcb.
// Непрозрачность проявленного узора в голове шлейфа, появление и угасание
$peak-opacity: 0.55;
$appear: 0.4s;
$fade: 2.8s;

// Маска зон — на обёртке, маска шлейфа — на слое узора внутри: в одном слое пересечь объединение точек
// с объединением нескольких зон маски не умеют. z-index: -1 — тот же приём, что у узора в board-zones:
// блок изолирован (isolation: isolate), слой лежит под его содержимым
.pcb-glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  -webkit-mask-image: var(--pcb-zones);
          mask-image: var(--pcb-zones);
}

.pcb-glow__trail {
  // Радиус каждой точки; спад: на середине радиуса — 40% непрозрачности центра, к краю — ноль
  --pcb-spot-radius: 56px;
  --pcb-spot-mid-share: 0.4;
  --pcb-spot-mid-at: 50%;

  position: absolute;
  inset: 0;
  background: url($board-pattern) 0 0 / #{$board-tile-size} auto repeat;
  opacity: calc(var(--pcb-glow-on, 0) * #{$peak-opacity});
  transition: opacity $fade ease;

  [data-pcb-active] > .pcb-glow > & {
    transition-duration: $appear;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pcb-glow {
    display: none;
  }
}
</style>
