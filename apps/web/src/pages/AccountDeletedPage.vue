<template>
  <AuthCard :mode="mode" :form-error="formError" />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n, useRoute, useSeoMeta } from '#imports'
import { deleteGoogleErrorMessage, useSessionSync } from '@/features/auth'
import { AuthCard } from '@/widgets/auth-card'

// Сюда возвращает API после удаления аккаунта через Google: ?status=deleted или ?error=<код>
const DELETED_STATUS = 'deleted'
const FAILED_CODE = 'delete_failed'

const { t } = useI18n()
const route = useRoute()

const isDeletedClaim = route.query.status === DELETED_STATUS && route.query.error === undefined
const mode = ref<'accountDeleted' | 'accountNotDeleted'>(isDeletedClaim ? 'accountDeleted' : 'accountNotDeleted')
const formError = ref(isDeletedClaim ? undefined : deleteGoogleErrorMessage(t, route.query.error))

useSeoMeta({ title: () => t(`auth.card.${mode.value}.title`), robots: 'noindex, nofollow' })

// Адрес можно открыть и вручную, поэтому «удалён» подтверждает сервер: сессия этого браузера больше не обновляется.
// Тогда сбрасываем сессию и во всех остальных вкладках
onMounted(async () => {
  if (!isDeletedClaim) return
  const sessionSync = useSessionSync()
  let hasSession = false
  try {
    hasSession = await sessionSync.refreshSession()
  } catch {
    // Сеть или сервер недоступны: проверить нельзя, итог — по адресу
  }
  if (hasSession) {
    mode.value = 'accountNotDeleted'
    formError.value = deleteGoogleErrorMessage(t, FAILED_CODE)
    return
  }
  sessionSync.publishLogout()
})
</script>
