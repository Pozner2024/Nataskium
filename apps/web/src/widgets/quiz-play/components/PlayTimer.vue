<template>
  <SessionTimer :mode="store.timer.mode" />
</template>

<script setup lang="ts">
import { PlayTimer as SessionTimer } from '@/features/play-session'
import { usePlayStore } from '../store'

const store = usePlayStore()
</script>
