<template>
  <form class="change-password-form" novalidate :aria-busy="isLoading" @submit.prevent="submit">
    <div class="change-password-form__alert" aria-live="polite">
      <p v-if="formError" class="change-password-form__message change-password-form__message--error">
        <svg class="change-password-form__icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" />
          <path d="M12 7v6M12 16.5v.5" />
        </svg>
        <span>{{ formError }}</span>
      </p>
      <p v-else-if="isDone" class="change-password-form__message change-password-form__message--done">
        <svg class="change-password-form__icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" />
          <path d="M7 12.5l3.5 3.5L17 9" />
        </svg>
        <span>{{ t('teacher.settings.password.done') }}</span>
      </p>
    </div>

    <AuthField
      :id="`${id}-current`"
      v-model="currentPassword"
      class="change-password-form__field"
      :label="t('teacher.settings.password.current')"
      type="password"
      autocomplete="current-password"
      required
      :error="fieldErrors.currentPassword"
    />
    <AuthField
      :id="`${id}-new`"
      v-model="newPassword"
      class="change-password-form__field"
      :label="t('teacher.settings.password.new')"
      type="password"
      autocomplete="new-password"
      required
      :error="fieldErrors.newPassword"
    />

    <AppButton class="change-password-form__submit" color="blue" type="submit" :disabled="isLoading">
      {{ isLoading ? t('teacher.settings.password.submitBusy') : t('teacher.settings.password.submit') }}
    </AppButton>
  </form>
</template>

<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { useI18n } from '#imports'
import { AppButton, AuthField } from '@/shared'
import type { ChangePasswordErrors, ChangePasswordPayload } from './types'

const props = withDefaults(defineProps<{
  isLoading?: boolean
  // Пароль сменён: поля очищаются, над формой — подтверждение
  isDone?: boolean
  formError?: string
  fieldErrors?: ChangePasswordErrors
}>(), { isLoading: false, isDone: false, formError: undefined, fieldErrors: () => ({}) })

const emit = defineEmits<{
  submit: [payload: ChangePasswordPayload]
}>()

const { t } = useI18n()
const id = useId()

const currentPassword = ref('')
const newPassword = ref('')

function submit() {
  emit('submit', { currentPassword: currentPassword.value, newPassword: newPassword.value })
}

watch(
  () => props.isDone,
  (isDone) => {
    if (!isDone) return
    currentPassword.value = ''
    newPassword.value = ''
  },
)
</script>

<style scoped lang="scss">
.change-password-form {
  display: flex;
  flex-direction: column;
}

.change-password-form__alert:not(:empty) {
  margin-bottom: 16px;
}

.change-password-form__message {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  color: var(--color-text);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;
}

.change-password-form__message--error {
  background: rgb(var(--rgb-orange) / 0.14);

  .change-password-form__icon {
    fill: var(--color-orange-dark);
  }
}

.change-password-form__message--done {
  background: rgb(var(--rgb-green) / 0.14);

  .change-password-form__icon {
    fill: var(--color-green-dark);
  }
}

.change-password-form__icon {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;

  path {
    fill: none;
    stroke: var(--color-white);
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.change-password-form__field + .change-password-form__field {
  margin-top: 16px;
}

// Селектор сильнее: ширина самой кнопки задана в AppButton, а порядок scoped-стилей не гарантирован
.change-password-form .change-password-form__submit {
  width: 100%;
  margin-top: 20px;
}
</style>
