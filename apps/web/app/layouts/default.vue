<template>
  <div class="default-layout">
    <AppHeader :has-glow="route.meta.headerGlow === true" />
    <div class="default-layout__content">
      <slot />
    </div>
    <PreFooter />
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { useRoute } from '#imports'
import { AppFooter } from '@/widgets/app-footer'
import { AppHeader } from '@/widgets/app-header'
import { PreFooter } from '@/widgets/pre-footer'

// Страница может попросить пятно боке в правом углу шапки, если её первый экран его продолжает
const route = useRoute()
</script>

<style scoped lang="scss">
.default-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

// Колонка, чтобы страница могла растянуться до футера (flex: 1)
.default-layout__content {
  display: flex;
  flex: 1;
  flex-direction: column;
}
</style>
