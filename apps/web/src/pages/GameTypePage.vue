<template>
  <main v-if="kind" class="game-type-page">
    <header class="game-type-page__head">
      <GameTypePreview class="game-type-page__preview" :type="kind" />
      <h1 class="game-type-page__title">{{ t(`gameTypes.${kind}.name`) }}</h1>
    </header>
    <p class="game-type-page__about">{{ t(`gameTypes.${kind}.about`) }}</p>
    <AppButton class="game-type-page__create" :to="localePath(newActivityPath(kind))">{{ t('gameTypes.create') }}</AppButton>

    <h2 class="game-type-page__examples">{{ t('gameTypes.examples') }}</h2>
    <LibraryBrowser :key="kind" :type="kind" />
  </main>
</template>

<script setup lang="ts">
import { newActivityPath, parseGameTypeSlug } from '@nataskium/shared/routes'
import { computed } from 'vue'
import { createError, useI18n, useLocalePath, useSeoMeta } from '#imports'
import { GameTypePreview } from '@/entities/activity'
import { AppButton } from '@/shared'
import { LibraryBrowser } from '@/widgets/library-browser'

const NOT_FOUND_CODE = 404

const props = defineProps<{ slug: string }>()

const { t } = useI18n()
const localePath = useLocalePath()

const kind = computed(() => parseGameTypeSlug(props.slug))

// Неизвестный тип — настоящий 404: адреса типов известны заранее
if (kind.value === null) throw createError({ status: NOT_FOUND_CODE, fatal: true })

useSeoMeta({
  title: () => (kind.value === null ? '' : t(`gameTypes.${kind.value}.name`)),
  description: () => (kind.value === null ? '' : t(`gameTypes.${kind.value}.about`)),
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.game-type-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px var(--gutter) 32px;
}

.game-type-page__head {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.game-type-page__title {
  @include section-title;
  font-size: 22px;
  hyphens: auto;
}

.game-type-page__about {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
}

// Два класса: ширина по умолчанию у AppButton — 280px, и длинная подпись переносилась на вторую строку
.game-type-page .game-type-page__create {
  width: 100%;
  max-width: 360px;
}

.game-type-page__examples {
  margin: 16px 0 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
}
</style>
