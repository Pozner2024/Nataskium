<template>
  <PlayPage :token="token" />
</template>

<script setup lang="ts">
import { useRoute } from '#imports'
import PlayPage from '@/pages/PlayPage.vue'

definePageMeta({ name: 'play-token', layout: 'play' })

const route = useRoute()
const token = String(route.params.token)
</script>
