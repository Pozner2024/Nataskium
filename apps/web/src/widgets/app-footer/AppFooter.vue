<template>
  <footer ref="root" class="app-footer" :class="{ 'app-footer--paused': isPaused }">
    <FooterCity />
    <FooterNav class="app-footer__nav" />
    <div class="app-footer__bottom">
      <NuxtLink class="app-footer__logo" :to="localePath('/')">
        <AppLogo on-dark />
      </NuxtLink>
      <!-- Название не повторяем: его даёт лого рядом -->
      <p class="app-footer__copyright">© {{ currentYear }}</p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useLocalePath, useState } from '#imports'
import { AppLogo, useOffscreenPause } from '@/shared'
import FooterCity from './components/FooterCity.vue'
import FooterNav from './components/FooterNav.vue'

const localePath = useLocalePath()
const root = useTemplateRef<HTMLElement>('root')
const { isPaused } = useOffscreenPause(root)
// Через useState клиент берёт год сервера: на границе года и в разных поясах они расходятся, и гидратация сломалась бы
const currentYear = useState('footer-year', () => new Date().getFullYear())
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;
@use '@/assets/styles/breakpoints.module' as *;

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
  position: relative;
  isolation: isolate;
  padding: 24px var(--gutter);

  // Узор только в левом нижнем углу блока, к остальной части плавно угасает
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    // Узор как в ночной теме интро Nataskium: синяя плата
    opacity: 0.6;
    background: url($board-pattern) 0 0 / #{$board-tile-size} auto repeat;
    -webkit-mask-image: radial-gradient(ellipse 73% 100% at 0% 100%, #000 0%, transparent 100%);
            mask-image: radial-gradient(ellipse 73% 100% at 0% 100%, #000 0%, transparent 100%);
  }

}

.app-footer__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-inline: var(--gutter);
  padding: 6px 0 10px;
  border-top: 1px solid rgb(var(--rgb-night-text) / 0.2);

  @include tablet {
    padding: 12px 0 16px;
  }
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
