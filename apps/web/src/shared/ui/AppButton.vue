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
// «Таблетка» с белым текстом и стрелкой. Белый на основных оранжевом и синем бренда — 2.5:1 и 4.2:1,
// поэтому текст крупный и жирный (от 18.67px bold — норма 3:1), а оранжевый фон темнее основного
.app-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  // Текст «Создать задание бесплатно» (18.7px bold) + стрелка и отступы — около 320px: в одну строку
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
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0) scale(0.98);
  }

  &:focus-visible {
    outline: 3px solid var(--color-text);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover,
    &:active {
      transform: none;
    }
  }
}

// #D9761C → тёмный оранжевый бренда: с белым крупным текстом 3.2–3.6:1
.app-button--orange {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.2), transparent 55%),
    linear-gradient(90deg, #d9761c, var(--color-orange-dark));
  box-shadow: 0 10px 24px rgb(var(--rgb-orange) / 0.4);

  &:hover {
    box-shadow: 0 14px 28px rgb(var(--rgb-orange) / 0.45);
  }
}

.app-button--blue {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.2), transparent 55%),
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
}
</style>
