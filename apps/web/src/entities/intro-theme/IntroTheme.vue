<template>
  <NataskiumScene v-if="theme.kind === 'code'" ref="scene" :tone="theme.tone" :state="state" :sound="sound" @clean="emit('clean')" />
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { findTheme } from './catalog'
import type { IntroSound } from './types'
import NataskiumScene from './nataskium/NataskiumScene.vue'

// Тема кодом пока одна (две темы Nataskium отличаются тоном); темы-ролики появятся вместе с первым роликом (ADR 0015)
const { themeKey = null, state = 'clean', sound = null } = defineProps<{
  themeKey?: string | null
  state?: 'clean' | 'assembled'
  sound?: IntroSound | null
}>()

const emit = defineEmits<{ clean: [] }>()

const scene = useTemplateRef<InstanceType<typeof NataskiumScene>>('scene')
const theme = computed(() => findTheme(themeKey))

// Резолвится, когда интро дошло до чистой сцены (или пропущено)
async function play(): Promise<void> {
  await scene.value?.play()
}

function skip() {
  scene.value?.skip()
}

defineExpose({ play, skip })
</script>
