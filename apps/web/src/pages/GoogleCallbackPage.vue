<template>
  <AuthCard mode="googleCallback" :form-error="formError" />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { navigateTo, useSeoMeta } from '#imports'
import { useSessionSync } from '@/features/auth'
import { AUTH_PATHS } from '@/shared'
import { AuthCard } from '@/widgets/auth-card'

const AFTER_SIGN_IN_PATH = '/'
// Коды как у редиректов API: страница входа покажет по ним текст
const SIGN_IN_FAILED_PATH = `${AUTH_PATHS.login}?error=google_failed`
const SIGN_IN_UNAVAILABLE_PATH = `${AUTH_PATHS.login}?error=google_unavailable`
const REDIRECTING_MESSAGE = 'Не получилось войти. Возвращаем на страницу входа…'

useSeoMeta({ title: 'Вход через Google', robots: 'noindex, nofollow' })

const sessionSync = useSessionSync()
const formError = ref<string | undefined>()

// API уже поставил refresh-cookie и вернул сюда. Access-токен в адресе не передаётся — получаем его через refresh
onMounted(async () => {
  try {
    const hasSession = await sessionSync.refreshSession()
    if (hasSession) {
      await navigateTo(AFTER_SIGN_IN_PATH, { replace: true })
      return
    }
    formError.value = REDIRECTING_MESSAGE
    await navigateTo(SIGN_IN_FAILED_PATH, { replace: true })
  } catch {
    formError.value = REDIRECTING_MESSAGE
    await navigateTo(SIGN_IN_UNAVAILABLE_PATH, { replace: true })
  }
})
</script>
