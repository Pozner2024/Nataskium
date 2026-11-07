<template>
  <AuthCard
    mode="verifyEmail"
    :is-loading="form.isLoading.value"
    :form-error="form.formError.value"
    :field-errors="form.fieldErrors.value"
    @submit="onSubmit"
  />
</template>

<script setup lang="ts">
import { verifyEmailSchema } from '@nataskium/shared/schemas'
import { onMounted, ref } from 'vue'
import { navigateTo, useSeoMeta } from '#imports'
import { authApi, takeTokenFromHash, useAuthForm, useSessionSync } from '@/features/auth'
import { AuthCard, type AuthCardSubmitPayload } from '@/widgets/auth-card'

const MISSING_TOKEN_MESSAGE = 'Ссылка неполная. Откройте письмо и перейдите по ссылке ещё раз'
const AFTER_SIGN_IN_PATH = '/'

useSeoMeta({ title: 'Подтверждение почты', robots: 'noindex, nofollow' })

const form = useAuthForm('verifyEmail')
const sessionSync = useSessionSync()
// Токен из письма — только в памяти страницы до отправки; из адресной строки убирается сразу
const token = ref<string | null>(null)

onMounted(() => {
  token.value = takeTokenFromHash()
  if (token.value === null) form.showFormError(MISSING_TOKEN_MESSAGE)
})

async function onSubmit(payload: AuthCardSubmitPayload) {
  if (token.value === null) {
    form.showFormError(MISSING_TOKEN_MESSAGE)
    return
  }
  const values = { password: payload.password ?? '' }
  await form.submit(verifyEmailSchema, values, { token: token.value, ...values }, async (input) => {
    sessionSync.publishSession(await authApi.verifyEmail(input))
    await navigateTo(AFTER_SIGN_IN_PATH)
  })
}
</script>
