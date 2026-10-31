<template>
  <TwinklingStars :big-stars="BIG_STARS" :small-stars="SMALL_STARS" :seed="RANDOM_SEED" />
</template>

<script setup lang="ts">
import { TwinklingStars } from '@/shared'
import { BIG_STARS, SMALL_STARS } from '../cityLayout'

const RANDOM_SEED = 11
</script>
