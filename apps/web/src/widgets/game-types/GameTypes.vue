<template>
  <section id="games" class="game-types" aria-labelledby="game-types-title">
    <h2 id="game-types-title" class="game-types__title">{{ t('home.gameTypes.title') }}</h2>
    <p class="game-types__subtitle">{{ t('home.gameTypes.subtitle') }}</p>

    <ul class="game-types__list">
      <li v-for="type in ACTIVITY_TYPE_ORDER" :key="type" class="game-types__item">
        <GameTypeCard :type="type" :to="localePath(gameTypePath(type))" />
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { useI18n, useLocalePath } from '#imports'
import { ACTIVITY_TYPE_ORDER, GameTypeCard } from '@/entities/activity'
import { gameTypePath } from '@nataskium/shared/routes'

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.game-types {
  @include section;

  @include board-zones(radial-gradient(ellipse 70% 40% at 0% 95%, #000 0%, transparent 100%));

  background: var(--color-white);
}

.game-types__title {
  @include section-title;
}

.game-types__subtitle {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
}

.game-types__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
