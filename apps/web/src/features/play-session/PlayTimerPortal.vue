<template>
  <Teleport :to="target" :disabled="!target">
    <slot />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { PLAYER_TIMER_SLOT_KEY } from './playerKeys'

// Таймер объявлен в игре (там его данные), а показан в полосе или колонке проигрывателя — внутри его контейнера,
// поэтому виден и в полном экране. Без проигрывателя остаётся на месте
const playerSlot = inject(PLAYER_TIMER_SLOT_KEY, null)
const target = computed(() => playerSlot?.target.value ?? null)
</script>
