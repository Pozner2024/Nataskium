<template>
  <NuxtLayout name="default">
    <ErrorPage :status="error.status" />
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'
import ErrorPage from '@/pages/ErrorPage.vue'

defineProps<{ error: NuxtError }>()
</script>
