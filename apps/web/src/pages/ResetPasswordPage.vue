<template>
  <AuthCard
    mode="resetPassword"
    :is-loading="form.isLoading.value"
    :is-sent="isDone"
    :form-error="form.formError.value"
    :field-errors="form.fieldErrors.value"
    @submit="onSubmit"
  />
</template>

<script setup lang="ts">
import { resetPasswordSchema } from '@nataskium/shared/schemas'
import { onMounted, ref } from 'vue'
import { useI18n, useSeoMeta } from '#imports'
import { authApi, takeTokenFromHash, useAuthForm, useSessionSync } from '@/features/auth'
import { useCurrentLocale } from '@/shared'
import { AuthCard, type AuthCardSubmitPayload } from '@/widgets/auth-card'

const { t } = useI18n()
const locale = useCurrentLocale()

useSeoMeta({ title: () => t('auth.card.resetPassword.title'), robots: 'noindex, nofollow' })

const form = useAuthForm('resetPassword')
const sessionSync = useSessionSync()
// Токен из письма — только в памяти страницы до отправки; из адресной строки убирается сразу
const token = ref<string | null>(null)
// После 204 — «Пароль изменён»: сессия не выдаётся, все сессии учителя сервер уже завершил
const isDone = ref(false)

onMounted(() => {
  token.value = takeTokenFromHash()
  if (token.value === null) form.showFormError(t('auth.page.missingToken'))
})

async function onSubmit(payload: AuthCardSubmitPayload) {
  if (token.value === null) {
    form.showFormError(t('auth.page.missingToken'))
    return
  }
  const values = { password: payload.password ?? '' }
  // Новый пароль — по правилам регистрации (passwordSchema): подсказки до запроса, сервер проверяет снова
  await form.submit(resetPasswordSchema, values, { token: token.value, ...values, locale: locale.value }, async (input) => {
    await authApi.resetPassword(input)
    // Сервер уже завершил все сессии учителя: эта и другие вкладки перестают использовать старый access-токен
    sessionSync.publishLogout()
    token.value = null
    isDone.value = true
  })
}
</script>
