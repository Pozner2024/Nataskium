<template>
  <AuthCard
    mode="register"
    :is-loading="form.isLoading.value"
    :is-sent="isSent"
    :form-error="form.formError.value"
    :field-errors="form.fieldErrors.value"
    @submit="onSubmit"
  />
</template>

<script setup lang="ts">
import { registerSchema } from '@nataskium/shared/schemas'
import { ref } from 'vue'
import { useI18n, useSeoMeta } from '#imports'
import { authApi, useAuthForm } from '@/features/auth'
import { useCurrentLocale } from '@/shared'
import { AuthCard, type AuthCardSubmitPayload } from '@/widgets/auth-card'

const { t } = useI18n()
const locale = useCurrentLocale()

useSeoMeta({ title: () => t('auth.card.register.title'), robots: 'noindex, nofollow' })

const form = useAuthForm('register')
// После 202 — «Проверьте почту» для любого адреса: по экрану не понять, был ли аккаунт
const isSent = ref(false)

async function onSubmit(payload: AuthCardSubmitPayload) {
  const values = { email: payload.email ?? '', password: payload.password ?? '' }
  // Пустое имя не отправляем: displayName необязательный, а пустая строка для API — ошибка
  const displayName = payload.displayName?.trim() ? payload.displayName : undefined
  await form.submit(registerSchema, values, { ...values, displayName, locale: locale.value }, async (input) => {
    await authApi.register(input)
    isSent.value = true
  })
}
</script>
