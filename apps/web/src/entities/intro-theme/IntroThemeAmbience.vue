<template>
  <NataskiumAmbience v-if="theme.kind === 'code'" :tone="theme.tone" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { findTheme } from './catalog'
import NataskiumAmbience from './nataskium/NataskiumAmbience.vue'

// Живой фон во время игры; у тем-роликов своего пока нет
const { themeKey = null } = defineProps<{
  themeKey?: string | null
}>()

const theme = computed(() => findTheme(themeKey))
</script>
