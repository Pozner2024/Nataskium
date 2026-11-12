<template>
  <main class="energy-orb-page">
    <h1 class="energy-orb-page__title">Энергетическая сфера</h1>
    <p class="energy-orb-page__hint">Нажми на Ната: сфера на антенне набирает энергию</p>
    <div class="energy-orb-page__stage">
      <NatCards compact />
    </div>
  </main>
</template>

<script setup lang="ts">
import { useSeoMeta } from '#imports'
import { NatCards } from '@/shared'

useSeoMeta({ robots: 'noindex, nofollow' })
</script>

<style scoped lang="scss">
.energy-orb-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-height: 100vh;
  background: var(--color-white);
  padding: 32px 16px;

  &__title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 500;
  }

  &__hint {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 14px;
  }

  // Ширина совпадает с ценой единицы сцены Ната
  &__stage {
    width: calc(var(--nat-unit) * 700);
    max-width: 100%;
  }
}
</style>
