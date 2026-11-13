<template>
  <div class="auth-layout" data-pcb>
    <PcbGlow />
    <header class="auth-layout__header">
      <NuxtLink class="auth-layout__logo" :to="localePath('/')">
        <AppLogo />
      </NuxtLink>
    </header>
    <main class="auth-layout__main">
      <slot />
    </main>
    <footer class="auth-layout__footer">
      <LanguageSwitcher />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { NuxtLink } from '#components'
import { useLocalePath } from '#imports'
import { LanguageSwitcher } from '@/features/language-switcher'
import { AppLogo, initPcbGlow, PcbGlow } from '@/shared'

const localePath = useLocalePath()

let stopPcbGlow: (() => void) | null = null
onMounted(() => {
  stopPcbGlow = initPcbGlow()
})
onBeforeUnmount(() => {
  stopPcbGlow?.()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.auth-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  @include board-zones(
    radial-gradient(ellipse 80% 35% at 100% 0%, #000 0%, transparent 100%),
    radial-gradient(ellipse 70% 35% at 0% 100%, #000 0%, transparent 100%)
  );

  background: var(--color-white);
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

.auth-layout__footer {
  display: flex;
  justify-content: center;
  text-align: center;
  padding: 0 var(--gutter) 16px;
  color: var(--color-text);
}

.auth-layout__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  padding: 0 var(--gutter) 16px;
}
</style>
