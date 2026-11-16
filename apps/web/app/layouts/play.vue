<template>
  <div class="play-layout">
    <AppHeader />
    <main class="play-layout__main">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { restoreSession } from '@/features/auth'
import { AppFooter } from '@/widgets/app-footer'
import { AppHeader } from '@/widgets/app-header'

onMounted(() => {
  void restoreSession()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.play-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  @include board-zones(
    radial-gradient(ellipse 80% 30% at 100% 0%, #000 0%, transparent 100%),
    radial-gradient(ellipse 70% 30% at 0% 100%, #000 0%, transparent 100%)
  );

  background: var(--color-white);
}

.play-layout__main {
  display: flex;
  flex: 1;
  flex-direction: column;
}
</style>
