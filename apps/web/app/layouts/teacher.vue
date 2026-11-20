<template>
  <div class="teacher-layout">
    <!-- Шапка и вкладки прилипают вместе: вкладки всегда под шапкой, без расчёта её высоты -->
    <div class="teacher-layout__top">
      <AppHeader />
      <TeacherTabs />
    </div>
    <main class="teacher-layout__main" data-pcb>
      <PcbGlow />
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useHead, useLocalePath, useRouter } from '#imports'
import { restoreSession, useAuthStore } from '@/features/auth'
import { initPcbGlow, PcbGlow } from '@/shared'
import { AppFooter } from '@/widgets/app-footer'
import { AppHeader } from '@/widgets/app-header'
import { TeacherTabs } from '@/widgets/teacher-tabs'

// Класс на <html>: прокрутка к элементу в фокусе учитывает липкую шапку с вкладками (global.scss)
useHead({ htmlAttrs: { class: 'has-sticky-tabs' } })

// Сессия закончилась на странице кабинета — выход здесь или в другой вкладке, удаление аккаунта, отказ refresh:
// уходим на главную, кабинет без сессии не показываем
const auth = useAuthStore()
const localePath = useLocalePath()
// Router — из setup: колбэк watch выполняется вне контекста Nuxt, navigateTo там недоступен
const router = useRouter()
watch(
  () => auth.status,
  (status) => {
    if (status === 'anonymous') void router.push(localePath('/'))
  },
)

let stopPcbGlow: (() => void) | null = null
onMounted(() => {
  stopPcbGlow = initPcbGlow()
  void restoreSession()
})
onBeforeUnmount(() => {
  stopPcbGlow?.()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.teacher-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.teacher-layout__top {
  position: sticky;
  top: 0;
  z-index: var(--z-header);
}

// Узор платы изолирует слой main: без z-index выпадающие меню внутри уходят под футер
.teacher-layout__main {
  z-index: var(--z-teacher-main);
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  padding: 20px var(--gutter) 40px;
  @include board-zones(
    radial-gradient(ellipse 80% 40% at 100% 0%, #000 0%, transparent 100%),
    radial-gradient(ellipse 70% 40% at 0% 100%, #000 0%, transparent 100%)
  );

  background: var(--color-white);
}
</style>
