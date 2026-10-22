<template>
  <circle v-if="shape === 'circle'" r="15" />
  <path v-else-if="shape === 'triangle'" d="M0 -16 L17 13 L-17 13 Z" />
  <rect v-else-if="shape === 'square'" x="-14" y="-14" width="28" height="28" rx="3" />
  <path v-else d="M0 -17 L5 -5 L17 -5 L7 3 L11 16 L0 8 L-11 16 L-7 3 L-17 -5 L-5 -5 Z" />
</template>

<script setup lang="ts">
defineProps<{
  shape: string
}>()
</script>
