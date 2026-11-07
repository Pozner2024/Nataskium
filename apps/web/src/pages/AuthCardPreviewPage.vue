<template>
  <div class="auth-card-preview">
    <section v-for="item in CASES" :key="item.name" class="auth-card-preview__item" :data-case="item.name">
      <h2 class="auth-card-preview__name">{{ item.name }}</h2>
      <AuthCard v-bind="item.props" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { useSeoMeta } from '#imports'
import { AuthCard, type AuthCardProps } from '@/widgets/auth-card'

useSeoMeta({ robots: 'noindex, nofollow' })

interface PreviewCase {
  name: string
  props: AuthCardProps
}

const CASES: PreviewCase[] = [
  { name: 'login', props: { mode: 'login' } },
  { name: 'login-loading', props: { mode: 'login', isLoading: true } },
  {
    name: 'login-error',
    props: {
      mode: 'login',
      formError: 'Неверная почта или пароль. Проверьте данные и попробуйте ещё раз.',
      fieldErrors: { email: 'Введите почту в формате name@school.ru' },
    },
  },
  { name: 'register', props: { mode: 'register' } },
  {
    name: 'register-error',
    props: {
      mode: 'register',
      formError: 'Не получилось создать аккаунт. Попробуйте позже.',
      fieldErrors: { password: 'Пароль должен быть не короче 4 символов' },
    },
  },
  { name: 'sent', props: { mode: 'register', isSent: true } },
]
</script>

<style scoped lang="scss">
.auth-card-preview {
  display: flex;
  flex-direction: column;
  gap: 48px;
  width: 100%;
  max-width: 420px;
}

.auth-card-preview__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.auth-card-preview__name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 500;
}
</style>
