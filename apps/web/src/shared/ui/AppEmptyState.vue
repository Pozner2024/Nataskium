<template>
  <section class="app-empty-state" :aria-labelledby="titleId">
    <div class="app-empty-state__nat">
      <slot name="nat" />
    </div>
    <h2 :id="titleId" class="app-empty-state__title">{{ title }}</h2>
    <p class="app-empty-state__text">{{ text }}</p>
    <div v-if="$slots.actions" class="app-empty-state__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useId } from 'vue'

defineProps<{
  title: string
  text: string
}>()

const titleId = useId()
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.app-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 20px 16px;
  border-radius: 28px;
  @include card-surface;
  text-align: center;
}

.app-empty-state__nat {
  --nat-unit: 0.3px;

  margin-bottom: 12px;

  &:empty {
    display: none;
  }
}

.app-empty-state__title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}

.app-empty-state__text {
  margin: 0;
  color: var(--color-text-muted);
}

.app-empty-state__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 20px;
}
</style>
