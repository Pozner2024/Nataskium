<template>
  <g fill="#fff">
    <template v-if="type === 'choice'">
      <rect x="-7" y="-7" width="6" height="6" rx="1.5" />
      <rect x="1" y="-7" width="6" height="6" rx="1.5" />
      <rect x="-7" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
    </template>
    <template v-else-if="type === 'truefalse'">
      <path d="M-8 0 L-5 3 L0 -3" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
      <path d="M3 -3 L8 3 M8 -3 L3 3" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
    </template>
    <template v-else-if="type === 'picture'">
      <rect x="-8" y="-6" width="16" height="12" rx="2" fill="none" stroke="#fff" stroke-width="2" />
      <path d="M-6 4 L-2 -1 L1 2 L3 0 L6 4 Z" />
      <circle cx="3" cy="-2.5" r="1.6" />
    </template>
    <template v-else>
      <rect x="-8" y="-5" width="5" height="3" rx="1" />
      <rect x="-1" y="-5" width="9" height="3" rx="1" />
      <rect x="-8" y="3" width="16" height="2.4" rx="1.2" opacity=".6" />
    </template>
  </g>
</template>

<script setup lang="ts">
import type { QuizType } from './quiz'

defineProps<{
  type: QuizType
}>()
</script>
