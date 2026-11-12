<template>
  <NuxtLayout name="default" :with-pre-footer="false">
    <ErrorPage :status="error.status" />
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'
import ErrorPage from '@/pages/ErrorPage.vue'
import { useHtmlLang, useSiteTitle } from '@/shared'

defineProps<{ error: NuxtError }>()

useHtmlLang()
useSiteTitle()
</script>
