<template>
  <PlayPage :address="{ kind: 'share', token }" />
</template>

<script setup lang="ts">
import { useRoute } from '#imports'
import PlayPage from '@/pages/PlayPage.vue'

definePageMeta({ name: 'play-token', layout: 'play', key: (route) => String(route.params.token) })

const route = useRoute()
const token = String(route.params.token)
</script>
