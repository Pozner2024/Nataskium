<template>
  <footer ref="root" class="app-footer" :class="{ 'app-footer--paused': isPaused }">
    <FooterCity />
    <FooterNav class="app-footer__nav" />
    <div class="app-footer__bottom">
      <NuxtLink class="app-footer__logo" to="/">
        <AppLogo on-dark />
      </NuxtLink>
      <!-- Название не повторяем: его даёт лого рядом -->
      <p class="app-footer__copyright">© {{ currentYear }}</p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useState } from '#imports'
import { AppLogo, useOffscreenPause } from '@/shared'
import FooterCity from './components/FooterCity.vue'
import FooterNav from './components/FooterNav.vue'

const root = useTemplateRef<HTMLElement>('root')
const { isPaused } = useOffscreenPause(root)
// Через useState клиент берёт год сервера: на границе года и в разных поясах они расходятся, и гидратация сломалась бы
const currentYear = useState('footer-year', () => new Date().getFullYear())
</script>

<style scoped lang="scss">
.app-footer {
  --focus-color: var(--color-white);

  overflow: hidden;
  background: var(--color-night);
}

.app-footer--paused :deep(*),
.app-footer--paused :deep(*::before) {
  animation-play-state: paused !important;
}

.app-footer__nav {
  padding: 24px var(--gutter);
}

.app-footer__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-inline: var(--gutter);
  padding: 12px 0 16px;
  border-top: 1px solid rgb(var(--rgb-night-text) / 0.2);
}

.app-footer__logo {
  display: flex;
  align-items: center;
  // Не меньше 120px: иначе глаза робо-«a» меньше 2px и моргание с улыбкой не читаются
  width: 120px;
  min-height: 44px;
}

.app-footer__copyright {
  margin: 0;
  padding-top: 4px;
  color: var(--color-night-text);
  font-size: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .app-footer :deep(*),
  .app-footer :deep(*::before) {
    animation: none !important;
  }
}
</style>
