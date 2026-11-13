<template>
  <button
    class="share-link-button"
    :class="`share-link-button--${status}`"
    type="button"
    :aria-label="t('teacher.activities.copyLinkLabel', { title })"
    @click="emit('copy')"
  >
    <svg v-if="status === 'copied'" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    <svg v-else viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
    <span class="share-link-button__text">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import type { ShareLinkStatus } from '../types'

const props = defineProps<{
  // Название задания: видимая подпись короткая, диктор слышит, ссылку на какое задание копирует кнопка
  title: string
  status: ShareLinkStatus
}>()

const emit = defineEmits<{
  copy: []
}>()

const { t } = useI18n()

// Видимая подпись меняется, а для экранного диктора итог объявляет общий aria-live в списке
const label = computed(() => {
  if (props.status === 'copied') return t('teacher.activities.linkCopiedShort')
  if (props.status === 'failed') return t('teacher.activities.copyFailedShort')
  return t('teacher.activities.copyLink')
})
</script>

<style scoped lang="scss">
.share-link-button {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 14px;
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);
  font: inherit;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.16);
    }
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.24);
  }

  svg {
    flex: none;
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.share-link-button--copied {
  background: rgb(var(--rgb-green) / 0.16);
  color: var(--color-text);

  svg {
    stroke: var(--color-green-dark);
  }
}

.share-link-button--failed {
  background: rgb(var(--rgb-orange) / 0.16);
  color: var(--color-text);
}

@media (prefers-reduced-motion: reduce) {
  .share-link-button {
    transition: none;
  }
}
</style>
