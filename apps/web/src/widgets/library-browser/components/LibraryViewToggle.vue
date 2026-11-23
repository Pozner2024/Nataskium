<template>
  <div class="library-view-toggle" role="group" :aria-label="t('library.view.label')">
    <button
      v-for="option in OPTIONS"
      :key="option"
      class="library-view-toggle__button"
      type="button"
      :data-view="option"
      :aria-pressed="view === option"
      @click="emit('update:view', option)"
    >
      <svg class="library-view-toggle__icon" viewBox="0 0 20 20" aria-hidden="true">
        <template v-if="option === 'tiles'">
          <rect x="2" y="2" width="16" height="7" rx="2" />
          <rect x="2" y="11" width="16" height="7" rx="2" />
        </template>
        <template v-else>
          <rect x="2" y="3" width="6" height="5" rx="1.5" />
          <rect x="10" y="4.5" width="8" height="2" rx="1" />
          <rect x="2" y="12" width="6" height="5" rx="1.5" />
          <rect x="10" y="13.5" width="8" height="2" rx="1" />
        </template>
      </svg>
      {{ t(`library.view.${option}`) }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'
import type { LibraryView } from '../useLibraryView'

const OPTIONS: LibraryView[] = ['tiles', 'list']

defineProps<{ view: LibraryView }>()

const emit = defineEmits<{ 'update:view': [view: LibraryView] }>()

const { t } = useI18n()
</script>

<style scoped lang="scss">
.library-view-toggle {
  display: flex;
  align-self: flex-end;
  gap: 4px;
  padding: 4px;
  border-radius: 16px;
  background: rgb(var(--rgb-blue) / 0.1);
}

.library-view-toggle__button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--color-blue-dark);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &[aria-pressed='true'] {
    background: var(--color-white);
    box-shadow: 0 2px 6px rgb(var(--rgb-night) / 0.12);
  }

  &:focus-visible {
    outline: 3px solid var(--color-blue-dark);
    outline-offset: 2px;
  }
}

.library-view-toggle__icon {
  width: 18px;
  height: 18px;
  fill: currentcolor;
}
</style>
