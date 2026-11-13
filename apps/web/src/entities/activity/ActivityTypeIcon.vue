<template>
  <span class="activity-type-icon" :class="`activity-type-icon--${ACTIVITY_TYPES[type].color}`" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path :d="ACTIVITY_TYPES[type].icon" /></svg>
  </span>
</template>

<script setup lang="ts">
import { ACTIVITY_TYPES } from './activityTypes'
import type { ActivityType } from './types'

defineProps<{
  type: ActivityType
}>()
</script>

<style scoped lang="scss">
.activity-type-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;

  svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: var(--color-white);
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.activity-type-icon--blue {
  background: var(--color-blue);
}

.activity-type-icon--green {
  background: var(--color-green);
}

.activity-type-icon--orange {
  background: var(--color-orange);
}
</style>
