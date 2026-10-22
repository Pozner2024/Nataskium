<template>
  <g class="nat-music-note" :transform="transform" :opacity="opacity" :fill="color" :style="{ color }">
    <template v-if="isPair">
      <ellipse cx="0" cy="0" rx="8.5" ry="6.2" transform="rotate(-22 0 0)" />
      <ellipse cx="22" cy="-6" rx="8.5" ry="6.2" transform="rotate(-22 22 -6)" />
      <path d="M7.5 -2 V-34 M29.5 -8 V-40" stroke="currentColor" stroke-width="2.6" fill="none" />
      <path d="M6.2 -34 L30.8 -40 L30.8 -33 L6.2 -27 Z" />
    </template>
    <template v-else>
      <ellipse cx="0" cy="0" rx="8.5" ry="6.2" transform="rotate(-22 0 0)" />
      <path d="M7.5 -2 V-36" stroke="currentColor" stroke-width="2.6" fill="none" />
      <path d="M7.5 -36 C15 -32 20 -26 17 -16 C16 -22 12 -26 7.5 -27 Z" />
    </template>
  </g>
</template>

<script setup lang="ts">
defineProps<{
  isPair: boolean
  color: string
  transform: string
  opacity: string
}>()
</script>

<style scoped lang="scss">
.nat-music-note {
  filter: drop-shadow(0 0 6px currentcolor);
}
</style>
