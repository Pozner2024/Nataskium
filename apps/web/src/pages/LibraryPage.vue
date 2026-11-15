<template>
  <main class="library-page">
    <h1 class="library-page__title">{{ t('library.title') }}</h1>
    <LibraryGroupTiles />
  </main>
</template>

<script setup lang="ts">
import { useI18n, useSeoMeta } from '#imports'
import { LibraryGroupTiles } from '@/widgets/library-groups'

const { t } = useI18n()

useSeoMeta({ title: () => t('library.title') })
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.library-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px var(--gutter) 32px;
}

.library-page__title {
  @include section-title;

  // «Aufgabenbibliothek» на 360px не влезает в строку
  hyphens: auto;
}
</style>
