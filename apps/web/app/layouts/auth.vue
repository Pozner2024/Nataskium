<template>
  <div class="auth-layout">
    <header class="auth-layout__header">
      <NuxtLink class="auth-layout__logo" to="/">
        <AppLogo />
      </NuxtLink>
    </header>
    <main class="auth-layout__main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components'
import { AppLogo } from '@/shared'
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.auth-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background:
    bokeh(var(--rgb-blue), 180px, 110% 20%, 0.34),
    bokeh(var(--rgb-orange), 150px, -14% 60%, 0.4),
    bokeh(var(--rgb-green), 130px, 100% bottom 150px, 0.34),
    var(--color-white);
}

.auth-layout__header {
  display: flex;
  justify-content: center;
  padding: 0 var(--gutter);
}

.auth-layout__logo {
  display: flex;
  align-items: center;
  width: 120px;
  min-height: 44px;
  border-radius: 12px;
}

.auth-layout__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  padding: 0 var(--gutter) 16px;
}
</style>
