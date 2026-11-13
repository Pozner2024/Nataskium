<template>
  <div class="delete-account">
    <button class="delete-account__open" type="button" aria-haspopup="dialog" @click="isOpen = true">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
      {{ t('teacher.settings.account.delete') }}
    </button>
    <p class="delete-account__hint">{{ t('teacher.settings.account.deleteHint') }}</p>

    <AppDialog v-model:open="isOpen" :title="t('teacher.settings.deleteDialog.title')">
      <p class="delete-account__text">{{ t('teacher.settings.deleteDialog.text') }}</p>

      <form v-if="hasPassword" :id="formId" class="delete-account__form" novalidate :aria-busy="isLoading" @submit.prevent="emit('confirm', password)">
        <AuthField
          :id="`${formId}-password`"
          v-model="password"
          :label="t('teacher.settings.deleteDialog.password')"
          type="password"
          autocomplete="current-password"
          required
          :error="error"
        />
      </form>
      <template v-else>
        <p class="delete-account__text">{{ t('teacher.settings.deleteDialog.googleText') }}</p>
        <p v-if="error" class="delete-account__error" role="alert">{{ error }}</p>
      </template>

      <template #actions>
        <button
          v-if="hasPassword"
          class="delete-account__confirm"
          type="submit"
          :form="formId"
          :disabled="isLoading"
        >
          {{ isLoading ? t('teacher.settings.deleteDialog.busy') : t('teacher.settings.deleteDialog.confirm') }}
        </button>
        <button v-else class="delete-account__confirm" type="button" :disabled="isLoading" @click="emit('confirmGoogle')">
          {{ isLoading ? t('teacher.settings.deleteDialog.busy') : t('teacher.settings.deleteDialog.confirmGoogle') }}
        </button>
        <!-- Без пароля первым в фокус попадает «Отмена», а не необратимое удаление -->
        <button class="delete-account__cancel" type="button" :autofocus="!hasPassword" @click="isOpen = false">
          {{ t('teacher.settings.deleteDialog.cancel') }}
        </button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { useI18n } from '#imports'
import { AppDialog, AuthField } from '@/shared'

withDefaults(defineProps<{
  // false — аккаунт только с Google: удаление подтверждается повторным входом в Google
  hasPassword?: boolean
  isLoading?: boolean
  // Неверный пароль или сбой удаления
  error?: string
}>(), { hasPassword: true, isLoading: false, error: undefined })

const emit = defineEmits<{
  confirm: [password: string]
  confirmGoogle: []
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const formId = useId()
const password = ref('')

watch(isOpen, (open) => {
  if (!open) password.value = ''
})
</script>

<style scoped lang="scss">
.delete-account {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

%action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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

  &:disabled {
    cursor: progress;
    opacity: 0.7;
  }
}

.delete-account__open {
  @extend %action-button;

  background: rgb(var(--rgb-orange) / 0.14);
  color: var(--color-text);

  svg {
    flex: none;
    width: 20px;
    height: 20px;
    fill: none;
    stroke: var(--color-orange-dark);
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-orange) / 0.22);
    }
  }

  &:active {
    background: rgb(var(--rgb-orange) / 0.3);
  }
}

.delete-account__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
  text-align: center;
}

.delete-account__text {
  margin: 0;
}

.delete-account__form {
  margin-top: 4px;
}

.delete-account__error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgb(var(--rgb-orange) / 0.14);
  font-size: 15px;
  font-weight: 500;
}

// Тёмный текст на оранжевом: 6.23:1. Белый дал бы 2.52:1 — для необратимого действия подпись должна читаться
.delete-account__confirm {
  @extend %action-button;

  background: var(--color-orange);
  color: var(--color-text);

  &:hover:not(:disabled) {
    background: var(--color-orange-light);
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-orange) / 0.8);
  }
}

.delete-account__cancel {
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
  .delete-account__open,
  .delete-account__confirm,
  .delete-account__cancel {
    transition: none;
  }
}
</style>
