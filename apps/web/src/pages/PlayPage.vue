<template>
  <QuizPlay :token="token" />
</template>

<script setup lang="ts">
import { QuizPlay } from '@/widgets/quiz-play'

defineProps<{ token: string }>()
</script>
