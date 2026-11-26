<template>
  <component :is="to ? 'div' : 'button'" class="game-type-card" :type="to ? undefined : 'button'" @click="onClick">
    <GameTypePreview class="game-type-card__preview" :type="type" />
    <span class="game-type-card__text">
      <component :is="to ? 'h3' : 'span'" class="game-type-card__name">
        <NuxtLink v-if="to" class="game-type-card__link" :to="to">{{ t(`gameTypes.${type}.name`) }}</NuxtLink>
        <template v-else>{{ t(`gameTypes.${type}.name`) }}</template>
      </component>
      <span class="game-type-card__description">{{ t(`gameTypes.${type}.description`) }}</span>
    </span>
  </component>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components'
import { useI18n } from '#imports'
import GameTypePreview from './GameTypePreview.vue'
import type { ActivityType } from './types'

// С to — карточка-ссылка (главная): нажимается вся карточка, ссылка растянута с названия. Без to — кнопка (выбор типа у учителя)
const props = defineProps<{
  type: ActivityType
  to?: string
}>()

const emit = defineEmits<{
  select: []
}>()

const { t } = useI18n()

function onClick() {
  if (props.to) return
  emit('select')
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.game-type-card {
  position: relative;
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border-radius: 22px;
  @include card-surface;
  color: var(--color-text);
  font: inherit;
  text-align: start;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;

  @media (hover: hover) {
    &:hover {
      border-color: var(--color-blue);
      box-shadow: 0 10px 28px rgb(var(--rgb-blue) / 0.18);
    }

    &:hover .game-type-card__name,
    &:hover .game-type-card__link {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

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

button.game-type-card {
  min-height: 88px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 3px solid var(--color-blue-dark);
    outline-offset: 2px;
  }
}

.game-type-card__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.game-type-card__name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: break-word;
  hyphens: auto;
}

.game-type-card__description {
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.4;
}

.game-type-card__link {
  color: inherit;
  text-decoration: none;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }

  &:focus-visible {
    outline: none;
  }
}

div.game-type-card:has(.game-type-card__link:focus-visible) {
  outline: 3px solid var(--color-blue-dark);
  outline-offset: 2px;
}
</style>
