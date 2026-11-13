<template>
  <div class="default-layout">
    <AppHeader />
    <div class="default-layout__content">
      <slot />
    </div>
    <PreFooter v-if="withPreFooter" />
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { restoreSession } from '@/features/auth'
import { initPcbGlow } from '@/shared'
import { AppFooter } from '@/widgets/app-footer'
import { AppHeader } from '@/widgets/app-header'
import { PreFooter } from '@/widgets/pre-footer'

let stopPcbGlow: (() => void) | null = null
onMounted(() => {
  stopPcbGlow = initPcbGlow()
  void restoreSession()
})
onBeforeUnmount(() => {
  stopPcbGlow?.()
})

// Призыв «Начните прямо сейчас» не нужен на страницах без учебного контента, например на ошибке
withDefaults(defineProps<{ withPreFooter?: boolean }>(), { withPreFooter: true })
</script>

<style scoped lang="scss">
.default-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.default-layout__content {
  display: flex;
  flex: 1;
  flex-direction: column;
}
</style>
