<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { useHtmlLang, useSiteTitle } from '@/shared'

useHtmlLang()
useSiteTitle()
</script>
