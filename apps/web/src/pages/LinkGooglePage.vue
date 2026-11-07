<template>
  <AuthCard
    mode="linkGoogle"
    :is-loading="form.isLoading.value"
    :form-error="form.formError.value"
    :field-errors="form.fieldErrors.value"
    @submit="onSubmit"
  />
</template>

<script setup lang="ts">
import { googleLinkSchema } from '@nataskium/shared/schemas'
import { onMounted, ref } from 'vue'
import { navigateTo, useSeoMeta } from '#imports'
import { authApi, takeTokenFromHash, useAuthForm, useSessionSync } from '@/features/auth'
import { AuthCard, type AuthCardSubmitPayload } from '@/widgets/auth-card'

const MISSING_TOKEN_MESSAGE = 'Ссылка неполная. Начните вход через Google заново'
const AFTER_SIGN_IN_PATH = '/'

useSeoMeta({ title: 'Вход через Google', robots: 'noindex, nofollow' })

const form = useAuthForm('googleLink')
const sessionSync = useSessionSync()
// Токен привязки из редиректа API — только в памяти страницы; секрет привязки браузер держит в httpOnly cookie
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
  await form.submit(googleLinkSchema, values, { token: token.value, ...values }, async (input) => {
    sessionSync.publishSession(await authApi.googleLink(input))
    await navigateTo(AFTER_SIGN_IN_PATH)
  })
}
</script>
