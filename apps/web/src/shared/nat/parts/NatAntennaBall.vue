<template>
  <g>
    <circle :cx="cx" :cy="cy" :r="(radius * (1.9 + flash * 1.2)).toFixed(1)" :fill="`url(#${haloId})`" :opacity="(0.45 + flash * 0.55).toFixed(2)" />
    <circle :cx="cx" :cy="cy" :r="radius" :fill="`url(#${ballId})`" />
    <circle
      :cx="cx - radius * 0.35"
      :cy="cy - radius * 0.38"
      :r="radius * 0.3"
      fill="#fff"
      :opacity="(0.55 + flash * 0.4).toFixed(2)"
    />
  </g>
</template>

<script setup lang="ts">
defineProps<{
  cx: number
  cy: number
  radius: number
  flash: number
  ballId: string
  haloId: string
}>()
</script>
