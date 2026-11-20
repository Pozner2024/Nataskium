<template>
  <h1 ref="heading" class="statement-card" tabindex="-1">{{ text }}</h1>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { focusInPlace } from '@/shared'

defineProps<{ text: string }>()

const heading = useTemplateRef<HTMLElement>('heading')

defineExpose({ focus: () => focusInPlace(heading.value) })
</script>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints.module' as *;

.statement-card {
  display: grid;
  place-items: center;
  min-height: 140px;
  margin: 22px 0 0;
  padding: 20px 16px;
  border: 2px solid var(--g-line);
  border-radius: 20px;
  background: var(--g-surface);
  color: var(--g-text);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
  overflow-wrap: anywhere;

  @include tablet {
    min-height: 180px;
    padding: 28px 32px;
    font-size: 30px;
  }

  @include desktop {
    min-height: 220px;
    font-size: 36px;
  }

  :fullscreen & {
    @include desktop {
      min-height: 260px;
      font-size: 44px;
    }
  }
}
</style>
