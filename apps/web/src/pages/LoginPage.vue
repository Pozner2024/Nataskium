<template>
  <AuthCard
    mode="login"
    :is-loading="form.isLoading.value"
    :form-error="form.formError.value"
    :field-errors="form.fieldErrors.value"
    @submit="onSubmit"
  />
</template>

<script setup lang="ts">
import { loginSchema } from '@nataskium/shared/schemas'
import { onMounted } from 'vue'
import { navigateTo, useRoute, useRouter, useSeoMeta } from '#imports'
import { authApi, googleErrorMessage, safeNextPath, useAuthForm, useSessionSync } from '@/features/auth'
import { AuthCard, type AuthCardSubmitPayload } from '@/widgets/auth-card'

useSeoMeta({ title: 'Вход', robots: 'noindex, nofollow' })

const route = useRoute()
const router = useRouter()
const form = useAuthForm('login')
const sessionSync = useSessionSync()

// После неудачного входа через Google API возвращает сюда с ?error=<код>: показываем текст и убираем код из адреса
onMounted(() => {
  const message = googleErrorMessage(route.query.error)
  if (message === undefined) return
  form.showFormError(message)
  const { error: _error, ...query } = route.query
  void router.replace({ query })
})

async function onSubmit(payload: AuthCardSubmitPayload) {
  const values = { email: payload.email ?? '', password: payload.password ?? '' }
  await form.submit(loginSchema, values, values, async (input) => {
    sessionSync.publishSession(await authApi.login(input))
    await navigateTo(safeNextPath(route.query.next))
  })
}
</script>
