<template>
  <GameTypePage :slug="slug" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from '#imports'
import GameTypePage from '@/pages/GameTypePage.vue'

definePageMeta({ name: 'game-type' })

const route = useRoute()
const slug = computed(() => String(route.params.slug))
</script>
