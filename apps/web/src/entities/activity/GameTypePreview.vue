<template>
  <span class="game-type-preview" aria-hidden="true">
    <svg v-if="type === 'quiz'" viewBox="0 0 160 120">
      <rect class="game-type-preview__box" x="12" y="12" width="136" height="26" rx="6" />
      <rect class="game-type-preview__bar" x="22" y="21" width="84" height="8" rx="4" />
      <rect class="game-type-preview__box" x="12" y="46" width="64" height="28" rx="6" />
      <rect class="game-type-preview__bar" x="22" y="57" width="36" height="6" rx="3" />
      <rect class="game-type-preview__box" x="84" y="46" width="64" height="28" rx="6" />
      <rect class="game-type-preview__bar" x="94" y="57" width="28" height="6" rx="3" />
      <rect class="game-type-preview__accent" x="12" y="80" width="64" height="28" rx="6" />
      <rect class="game-type-preview__bar game-type-preview__bar--on" x="22" y="91" width="24" height="6" rx="3" />
      <path class="game-type-preview__glyph" d="M54 94l4 4 8-8" />
      <rect class="game-type-preview__box" x="84" y="80" width="64" height="28" rx="6" />
      <rect class="game-type-preview__bar" x="94" y="91" width="40" height="6" rx="3" />
    </svg>

    <svg v-else-if="type === 'matching'" viewBox="0 0 160 120">
      <path class="game-type-preview__link" d="M52 24C72 24 72 60 92 60M52 60C72 60 72 96 92 96M52 96C72 96 72 24 92 24" />
      <rect class="game-type-preview__box" x="12" y="12" width="40" height="24" rx="6" />
      <rect class="game-type-preview__bar" x="20" y="21" width="24" height="6" rx="3" />
      <rect class="game-type-preview__box" x="12" y="48" width="40" height="24" rx="6" />
      <rect class="game-type-preview__bar" x="20" y="57" width="18" height="6" rx="3" />
      <rect class="game-type-preview__box" x="12" y="84" width="40" height="24" rx="6" />
      <rect class="game-type-preview__bar" x="20" y="93" width="22" height="6" rx="3" />
      <rect class="game-type-preview__box" x="92" y="12" width="56" height="24" rx="6" />
      <rect class="game-type-preview__bar" x="100" y="18" width="40" height="5" rx="2.5" />
      <rect class="game-type-preview__bar" x="100" y="26" width="26" height="5" rx="2.5" />
      <rect class="game-type-preview__box" x="92" y="48" width="56" height="24" rx="6" />
      <rect class="game-type-preview__bar" x="100" y="54" width="36" height="5" rx="2.5" />
      <rect class="game-type-preview__bar" x="100" y="62" width="30" height="5" rx="2.5" />
      <rect class="game-type-preview__box" x="92" y="84" width="56" height="24" rx="6" />
      <rect class="game-type-preview__bar" x="100" y="90" width="40" height="5" rx="2.5" />
      <rect class="game-type-preview__bar" x="100" y="98" width="20" height="5" rx="2.5" />
      <circle class="game-type-preview__dot" cx="52" cy="24" r="3.5" />
      <circle class="game-type-preview__dot" cx="92" cy="60" r="3.5" />
      <circle class="game-type-preview__dot" cx="52" cy="60" r="3.5" />
      <circle class="game-type-preview__dot" cx="92" cy="96" r="3.5" />
      <circle class="game-type-preview__dot" cx="52" cy="96" r="3.5" />
      <circle class="game-type-preview__dot" cx="92" cy="24" r="3.5" />
    </svg>

    <svg v-else viewBox="0 0 160 120">
      <rect class="game-type-preview__box" x="12" y="12" width="136" height="54" rx="6" />
      <rect class="game-type-preview__bar" x="24" y="26" width="112" height="8" rx="4" />
      <rect class="game-type-preview__bar" x="24" y="42" width="76" height="8" rx="4" />
      <rect class="game-type-preview__yes" x="12" y="74" width="64" height="34" rx="6" />
      <path class="game-type-preview__glyph" d="M36 91l6 6 11-12" />
      <rect class="game-type-preview__no" x="84" y="74" width="64" height="34" rx="6" />
      <path class="game-type-preview__glyph" d="M110 85l12 12M122 85l-12 12" />
    </svg>
  </span>
</template>

<script setup lang="ts">
import type { ActivityType } from './types'

// Схема игры без визуального стиля и без текста: плашки-заглушки из общего набора фигур. Рядом всегда стоит название типа
defineProps<{
  type: ActivityType
}>()
</script>

<style scoped lang="scss">
// Холст 160×120 (4:3): поля 12, шаг 8, скругление фигур 6. Новый тип рисуется из тех же фигур
.game-type-preview {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 14px;
  background: linear-gradient(160deg, #e9effd 0%, #dfe8fc 100%);

  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
}

.game-type-preview__box,
.game-type-preview__accent,
.game-type-preview__yes,
.game-type-preview__no {
  filter: drop-shadow(0 1.5px 1.5px rgb(37 73 197 / 0.18));
}

.game-type-preview__box {
  fill: var(--color-white);
}

.game-type-preview__accent {
  fill: var(--color-blue);
}

.game-type-preview__bar {
  fill: rgb(var(--rgb-night) / 0.2);
}

.game-type-preview__bar--on {
  fill: rgb(var(--rgb-white) / 0.75);
}

.game-type-preview__link {
  fill: none;
  stroke: var(--color-blue);
  stroke-width: 3;
  stroke-linecap: round;
}

.game-type-preview__dot {
  fill: var(--color-blue);
}

.game-type-preview__glyph {
  fill: none;
  stroke: var(--color-white);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.game-type-preview__yes {
  fill: var(--color-green-dark);
}

.game-type-preview__no {
  fill: var(--color-orange-dark);
}
</style>
