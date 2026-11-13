<template>
  <details ref="root" class="activity-menu" @keydown.esc="close">
    <summary ref="trigger" class="activity-menu__trigger" :aria-label="t('teacher.activities.more', { title })">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h.01M12 12h.01M18 12h.01" /></svg>
    </summary>
    <ul class="activity-menu__list">
      <li>
        <button class="activity-menu__item" type="button" @click="choose('edit')">{{ t('teacher.activities.edit') }}</button>
      </li>
      <li>
        <button class="activity-menu__item" type="button" @click="choose('delete')">{{ t('teacher.activities.delete') }}</button>
      </li>
    </ul>
  </details>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useI18n } from '#imports'

defineProps<{
  title: string
}>()

const emit = defineEmits<{
  edit: []
  delete: []
}>()

const { t } = useI18n()
const root = useTemplateRef<HTMLDetailsElement>('root')
const trigger = useTemplateRef<HTMLElement>('trigger')

function close() {
  if (!root.value?.open) return
  root.value.open = false
  trigger.value?.focus()
}

function choose(action: 'edit' | 'delete') {
  close()
  if (action === 'edit') emit('edit')
  else emit('delete')
}
</script>

<style scoped lang="scss">
.activity-menu {
  position: relative;
  flex: none;
}

.activity-menu__trigger {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);
  cursor: pointer;
  list-style: none;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  &::-webkit-details-marker {
    display: none;
  }

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.16);
    }
  }

  &:active,
  .activity-menu[open] & {
    background: rgb(var(--rgb-blue) / 0.24);
  }

  svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
  }
}

.activity-menu__list {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  display: grid;
  min-width: 160px;
  margin: 0;
  padding: 6px;
  border-radius: 14px;
  background: var(--color-white);
  box-shadow: 0 12px 28px rgb(var(--rgb-night) / 0.18);
  list-style: none;
}

.activity-menu__item {
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  border: 0;
  border-radius: 9px;
  background: none;
  color: var(--color-text);
  font: inherit;
  font-weight: 500;
  text-align: start;
  cursor: pointer;

  &:hover {
    background: rgb(var(--rgb-blue) / 0.13);
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .activity-menu__trigger {
    transition: none;
  }
}
</style>
