<template>
  <component :is="to ? NuxtLink : 'button'" class="app-button" :class="`app-button--${color}`" :to="to" :type="to ? undefined : 'button'">
    <span class="app-button__text"><slot /></span>
    <svg class="app-button__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" /></svg>
  </component>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components'

withDefaults(defineProps<{
  color?: 'orange' | 'blue'
  // С адресом кнопка становится настоящей ссылкой: работает без JS и открывается в новой вкладке
  to?: string
}>(), { color: 'orange', to: undefined })
</script>

<style scoped lang="scss">
.app-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 320px;
  max-width: 100%;
  min-height: 60px;
  padding: 8px 14px;
  border: 0;
  border-radius: 999px;
  color: var(--color-white);
  font: inherit;
  font-size: 18.7px;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:active {
    transform: scale(0.98);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active {
      transform: none;
    }
  }
}

// Решение пользователя (2026-11-01): фирменный оранжевый с белым текстом, контраст 2.52:1 ниже нормы 3:1 осознанно.
// Блика нет: он снизил бы контраст ещё сильнее
.app-button--orange {
  background: var(--color-orange);
  box-shadow: 0 10px 24px rgb(var(--rgb-orange) / 0.4);

  &:hover {
    box-shadow: 0 14px 28px rgb(var(--rgb-orange) / 0.45);
  }
}

.app-button--blue {
  background:
    linear-gradient(180deg, rgb(var(--rgb-white) / 0.16), transparent 55%),
    var(--color-blue);
  box-shadow: 0 10px 24px rgb(var(--rgb-blue) / 0.4);

  &:hover {
    box-shadow: 0 14px 28px rgb(var(--rgb-blue) / 0.45);
  }
}

.app-button__arrow {
  flex: none;
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.2s ease;

  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    .app-button:hover & {
      transform: translateX(4px);
    }
  }
}
</style>
