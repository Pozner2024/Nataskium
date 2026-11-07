<template>
  <GoogleCallbackPage />
</template>

<script setup lang="ts">
import GoogleCallbackPage from '@/pages/GoogleCallbackPage.vue'

definePageMeta({ name: 'auth-callback', layout: 'auth' })
</script>
