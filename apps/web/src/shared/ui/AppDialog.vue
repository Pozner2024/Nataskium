<template>
  <dialog ref="dialog" class="app-dialog" :aria-labelledby="titleId" @cancel.prevent="close" @click="onBackdropClick">
    <div class="app-dialog__panel">
      <h2 :id="titleId" class="app-dialog__title">{{ title }}</h2>
      <slot />
      <div class="app-dialog__actions">
        <slot name="actions" />
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { onMounted, useId, useTemplateRef, watch } from 'vue'

defineProps<{
  title: string
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = useId()

function close() {
  isOpen.value = false
}

// Клик по затемнению попадает в сам <dialog>: панель занимает его целиком, поэтому её клики сюда не доходят
function onBackdropClick(event: MouseEvent) {
  if (event.target === dialog.value) close()
}

// showModal, а не атрибут open: только так страница за диалогом становится inert, а Esc закрывает его
function sync(open: boolean) {
  if (!dialog.value) return
  if (open && !dialog.value.open) dialog.value.showModal()
  if (!open && dialog.value.open) dialog.value.close()
}

watch(isOpen, sync)
onMounted(() => sync(isOpen.value))
</script>

<style scoped lang="scss">
.app-dialog {
  width: min(400px, calc(100% - 2 * var(--gutter)));
  max-height: calc(100% - 2 * var(--gutter));
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 28px;
  background: var(--color-white);
  color: var(--color-text);
  box-shadow: 0 18px 40px rgb(var(--rgb-night) / 0.24);

  &::backdrop {
    background: rgb(var(--rgb-night) / 0.45);
  }

  &[open] {
    animation: app-dialog-in 0.2s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    &[open] {
      animation: none;
    }
  }
}

.app-dialog__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 20px 20px;
}

.app-dialog__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}

.app-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

@keyframes app-dialog-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}
</style>
