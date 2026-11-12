<template>
  <main class="home-page">
    <HomeHero />
    <HowItWorks />
    <WhyUs />
    <HowToStart />
  </main>
</template>

<script setup lang="ts">
import { useI18n, useSeoMeta } from '#imports'
import { HomeHero } from '@/widgets/home-hero'
import { HowItWorks } from '@/widgets/how-it-works'
import { HowToStart } from '@/widgets/how-to-start'
import { WhyUs } from '@/widgets/why-us'

const { t } = useI18n()

useSeoMeta({
  title: () => t('home.meta.title'),
  description: () => t('home.meta.description'),
})
</script>

<style scoped lang="scss">
.home-page {
  flex: 1;
  background: var(--color-white);
}
</style>
