<template>
  <div class="teacher-preview">
    <section class="teacher-preview__item" data-case="activities-list">
      <h2 class="teacher-preview__name">activities-list</h2>
      <MyActivities :activities="ACTIVITIES_STUB" />
    </section>

    <section class="teacher-preview__item" data-case="activities-empty">
      <h2 class="teacher-preview__name">activities-empty</h2>
      <MyActivities :activities="[]" />
    </section>

    <section v-for="item in PASSWORD_CASES" :key="item.name" class="teacher-preview__item teacher-preview__item--panel" :data-case="item.name">
      <h2 class="teacher-preview__name">{{ item.name }}</h2>
      <ChangePasswordForm v-bind="item.props" />
    </section>

    <section class="teacher-preview__item teacher-preview__item--panel" data-case="delete-google">
      <h2 class="teacher-preview__name">delete-google</h2>
      <DeleteAccount v-model:open="isGoogleDialogOpen" :has-password="false" />
    </section>

    <section class="teacher-preview__item teacher-preview__item--panel" data-case="delete-error">
      <h2 class="teacher-preview__name">delete-error</h2>
      <DeleteAccount error="Неверный пароль" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSeoMeta } from '#imports'
import { ChangePasswordForm } from '@/features/change-password'
import { DeleteAccount } from '@/features/delete-account'
import { ACTIVITIES_STUB, MyActivities } from '@/widgets/my-activities'

useSeoMeta({ robots: 'noindex, nofollow' })

const PASSWORD_CASES = [
  { name: 'password-loading', props: { isLoading: true } },
  {
    name: 'password-error',
    props: {
      formError: 'Не получилось сменить пароль. Попробуйте позже.',
      fieldErrors: { currentPassword: 'Неверный текущий пароль', newPassword: 'Пароль должен быть не короче 4 символов' },
    },
  },
  { name: 'password-done', props: { isDone: true } },
]

const isGoogleDialogOpen = ref(false)
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-preview {
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.teacher-preview__item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.teacher-preview__item--panel {
  padding: 20px;
  border-radius: 22px;
  @include card-surface;
}

.teacher-preview__name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 500;
}
</style>
