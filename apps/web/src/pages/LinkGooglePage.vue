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
import { navigateTo, useI18n, useLocalePath, useSeoMeta } from '#imports'
import { AFTER_SIGN_IN_PATH, authApi, takeTokenFromHash, useAuthForm, useSessionSync } from '@/features/auth'
import { useCurrentLocale } from '@/shared'
import { AuthCard, type AuthCardSubmitPayload } from '@/widgets/auth-card'


const { t } = useI18n()
const locale = useCurrentLocale()
const localePath = useLocalePath()

useSeoMeta({ title: () => t('auth.card.linkGoogle.title'), robots: 'noindex, nofollow' })

const form = useAuthForm('googleLink')
const sessionSync = useSessionSync()
// Токен привязки из редиректа API — только в памяти страницы; секрет привязки браузер держит в httpOnly cookie
const token = ref<string | null>(null)

onMounted(() => {
  token.value = takeTokenFromHash()
  if (token.value === null) form.showFormError(t('auth.page.missingGoogleToken'))
})

async function onSubmit(payload: AuthCardSubmitPayload) {
  if (token.value === null) {
    form.showFormError(t('auth.page.missingGoogleToken'))
    return
  }
  const values = { password: payload.password ?? '' }
  await form.submit(googleLinkSchema, values, { token: token.value, ...values, locale: locale.value }, async (input) => {
    sessionSync.publishSession(await authApi.googleLink(input))
    await navigateTo(localePath(AFTER_SIGN_IN_PATH))
  })
}
</script>
