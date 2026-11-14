<template>
  <div class="play-layout">
    <header class="play-layout__header">
      <NuxtLink class="play-layout__logo" :to="localePath('/')">
        <AppLogo />
      </NuxtLink>
    </header>
    <main class="play-layout__main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components'
import { useLocalePath } from '#imports'
import { AppLogo } from '@/shared'

const localePath = useLocalePath()
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

.play-layout__header {
  display: flex;
  justify-content: center;
  padding: 4px var(--gutter) 0;
}

.play-layout__logo {
  display: flex;
  align-items: center;
  width: 112px;
  min-height: 48px;
  border-radius: 12px;
}

.play-layout__main {
  display: flex;
  flex: 1;
  flex-direction: column;
}
</style>
