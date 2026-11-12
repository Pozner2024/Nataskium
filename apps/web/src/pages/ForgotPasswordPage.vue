<template>
  <AuthCard
    mode="forgotPassword"
    :is-loading="form.isLoading.value"
    :is-sent="isSent"
    :form-error="form.formError.value"
    :field-errors="form.fieldErrors.value"
    @submit="onSubmit"
  />
</template>

<script setup lang="ts">
import { forgotPasswordSchema } from '@nataskium/shared/schemas'
import { ref } from 'vue'
import { useI18n, useSeoMeta } from '#imports'
import { authApi, useAuthForm } from '@/features/auth'
import { useCurrentLocale } from '@/shared'
import { AuthCard, type AuthCardSubmitPayload } from '@/widgets/auth-card'

const { t } = useI18n()
const locale = useCurrentLocale()

useSeoMeta({ title: () => t('auth.card.forgotPassword.title'), robots: 'noindex, nofollow' })

const form = useAuthForm('forgotPassword')
// После 202 — один экран для любого адреса: по нему не понять, есть ли аккаунт
const isSent = ref(false)

async function onSubmit(payload: AuthCardSubmitPayload) {
  const values = { email: payload.email ?? '' }
  await form.submit(forgotPasswordSchema, values, { ...values, locale: locale.value }, async (input) => {
    await authApi.forgotPassword(input)
    isSent.value = true
  })
}
</script>
