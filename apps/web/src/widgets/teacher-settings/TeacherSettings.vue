<template>
  <div class="teacher-settings">
    <section class="teacher-settings__section" :aria-labelledby="`${id}-language`">
      <h2 :id="`${id}-language`" class="teacher-settings__title">{{ t('teacher.settings.language.title') }}</h2>
      <LanguageSwitcher class="teacher-settings__language" />
    </section>

    <section class="teacher-settings__section" :aria-labelledby="`${id}-password`">
      <h2 :id="`${id}-password`" class="teacher-settings__title">{{ t('teacher.settings.password.title') }}</h2>
      <ChangePasswordForm
        v-if="hasPassword"
        :is-loading="isPasswordLoading"
        :is-done="isPasswordChanged"
        :form-error="passwordError"
        :field-errors="passwordFieldErrors"
        @submit="changePassword"
      />
      <p v-else class="teacher-settings__note">{{ t('teacher.settings.password.googleOnly') }}</p>
    </section>

    <section class="teacher-settings__section" :aria-labelledby="`${id}-subscription`">
      <h2 :id="`${id}-subscription`" class="teacher-settings__title">{{ t('teacher.settings.subscription.title') }}</h2>
      <p class="teacher-settings__plan">{{ t('teacher.settings.subscription.plan') }}</p>
      <p class="teacher-settings__note">{{ t('teacher.settings.subscription.soon') }}</p>
    </section>

    <section class="teacher-settings__section" :aria-labelledby="`${id}-account`">
      <h2 :id="`${id}-account`" class="teacher-settings__title">{{ t('teacher.settings.account.title') }}</h2>
      <button class="teacher-settings__logout" type="button" @click="logout">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" /></svg>
        {{ t('teacher.settings.account.logout') }}
      </button>
      <DeleteAccount
        v-model:open="isDeleteOpen"
        class="teacher-settings__delete"
        :has-password="hasPassword"
        :is-loading="isDeleteLoading"
        :error="deleteError"
        @confirm="deleteAccount"
        @confirm-google="deleteAccountWithGoogle"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from '#imports'
import { useAuthStore } from '@/features/auth'
import { ChangePasswordForm } from '@/features/change-password'
import { DeleteAccount } from '@/features/delete-account'
import { LanguageSwitcher } from '@/features/language-switcher'
import { useTeacherSettings } from './useTeacherSettings'

const { t } = useI18n()
const id = useId()
const auth = useAuthStore()
const {
  isPasswordLoading,
  passwordError,
  passwordFieldErrors,
  isPasswordChanged,
  changePassword,
  isDeleteOpen,
  isDeleteLoading,
  deleteError,
  deleteAccount,
  deleteAccountWithGoogle,
  logout,
} = useTeacherSettings()

// Пока сессия не восстановлена, считаем, что пароль есть: форма не мигает заменой на текст про Google
const hasPassword = computed(() => auth.teacher?.hasPassword ?? true)
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.teacher-settings__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: 22px;
  @include card-surface;
}

.teacher-settings__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.teacher-settings__language {
  margin-inline: -10px;

  // Первый раздел страницы: меню, открытое вверх, ушло бы под липкую шапку
  :deep(.language-switcher__menu) {
    top: calc(100% + 6px);
    bottom: auto;
  }
}

.teacher-settings__plan {
  margin: 0;
  font-weight: 700;
}

.teacher-settings__note {
  margin: 0;
  color: var(--color-text-muted);
}

.teacher-settings__plan + .teacher-settings__note {
  margin-top: -8px;
}

.teacher-settings__logout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 8px 16px;
  border: 0;
  border-radius: 999px;
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);
  font: inherit;
  font-weight: 700;
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
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.teacher-settings__delete {
  margin-top: 8px;
  padding-top: 20px;
  border-top: 1px solid rgb(var(--rgb-blue) / 0.13);
}

@media (prefers-reduced-motion: reduce) {
  .teacher-settings__logout {
    transition: none;
  }
}
</style>
