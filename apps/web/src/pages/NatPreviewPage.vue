<template>
  <main class="nat-preview-page">
    <h1 class="nat-preview-page__title">Нат</h1>
    <p class="nat-preview-page__hint">Нажми на Ната</p>
    <div class="nat-preview-page__grid">
      <section
        v-for="scene in SCENES"
        :key="scene.name"
        class="nat-preview-page__card"
      >
        <component :is="scene.component" v-bind="scene.props" />
        <h2 class="nat-preview-page__name">{{ scene.name }}</h2>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { useSeoMeta } from '#imports'
import { NatAtom, NatBrain, NatBulb, NatCards, NatGalaxy, NatGear, NatGeometry, NatLetters, NatMusic, NatSaturn, NatStudents, NatTeacher } from '@/shared'

// Служебная страница для просмотра Натов — поисковикам не нужна
useSeoMeta({ robots: 'noindex, nofollow' })

interface PreviewScene {
  name: string
  component: Component
  props?: Record<string, unknown>
}

const SCENES: PreviewScene[] = [
  { name: 'Собирает задание', component: NatCards },
  { name: 'Атом', component: NatAtom },
  { name: 'Сатурн', component: NatSaturn },
  { name: 'Галактика', component: NatGalaxy },
  { name: 'Шестерёнки', component: NatGear },
  { name: 'Геометрия', component: NatGeometry },
  { name: 'Лампочка', component: NatBulb },
  { name: 'Буквы', component: NatLetters },
  { name: 'Музыка', component: NatMusic },
  { name: 'Мозг', component: NatBrain },
  { name: 'Учитель', component: NatTeacher },
  { name: 'Студенты', component: NatStudents },
]
</script>

<style scoped lang="scss">
.nat-preview-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-height: 100vh;
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

  &__grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: flex-end;
    gap: 32px;
    width: min(1400px, 100%);
  }

  &__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    max-width: 100%;
  }

  &__name {
    margin: 0;
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 500;
  }
}
</style>
