<template>
  <AppDialog v-model:open="isOpen" :title="title">
    <p class="app-confirm-dialog__text">{{ text }}</p>
    <template #actions>
      <button class="app-confirm-dialog__confirm" type="button" @click="confirm">{{ confirmLabel }}</button>
      <!-- В фокус попадает безопасная кнопка, а не необратимое действие -->
      <button class="app-confirm-dialog__cancel" type="button" autofocus @click="isOpen = false">{{ cancelLabel }}</button>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import AppDialog from './AppDialog.vue'

defineProps<{
  title: string
  text: string
  confirmLabel: string
  cancelLabel: string
}>()

const emit = defineEmits<{
  confirm: []
}>()

const isOpen = defineModel<boolean>('open', { default: false })

function confirm() {
  emit('confirm')
  isOpen.value = false
}
</script>

<style scoped lang="scss">
.app-confirm-dialog__text {
  margin: 0;
}

%action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 8px 16px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-weight: 700;
  line-height: 1.25;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;
}

// Тёмный текст на оранжевом: 6.23:1 — подпись необратимого действия должна читаться
.app-confirm-dialog__confirm {
  @extend %action-button;

  background: var(--color-orange);
  color: var(--color-text);

  @media (hover: hover) {
    &:hover {
      background: var(--color-orange-light);
    }
  }

  &:active {
    background: rgb(var(--rgb-orange) / 0.8);
  }
}

.app-confirm-dialog__cancel {
  @extend %action-button;

  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.16);
    }
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.24);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-confirm-dialog__confirm,
  .app-confirm-dialog__cancel {
    transition: none;
  }
}
</style>
