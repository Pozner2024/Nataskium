<template>
  <main class="error-page" data-pcb>
    <PcbGlow />
    <NatGear compact />
    <p v-if="status" class="error-page__code">{{ status }}</p>
    <h1 class="error-page__title">{{ text.title }}</h1>
    <p class="error-page__description">{{ text.description }}</p>
    <AppButton color="blue" :to="localePath('/')">{{ t('errorPage.home') }}</AppButton>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n, useLocalePath, useSeoMeta } from '#imports'
import { AppButton, NatGear, PcbGlow } from '@/shared'

const props = defineProps<{
  status?: number
}>()

const NOT_FOUND_CODE = 404

const { t } = useI18n()
const localePath = useLocalePath()

// Текст ошибки с сервера не показываем: в нём могут быть внутренние детали
const text = computed(() => {
  const base = props.status === NOT_FOUND_CODE ? 'errorPage.notFound' : 'errorPage.serverError'
  return { title: t(`${base}.title`), description: t(`${base}.description`) }
})

useSeoMeta({ title: () => text.value.title, robots: 'noindex, nofollow' })
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.error-page {
  --nat-unit: 0.34px;

  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  padding: 32px var(--gutter) 48px;
  text-align: center;
  @include board-zones(radial-gradient(ellipse 75% 50% at 100% 0%, #000 0%, transparent 100%));

  background: var(--color-white);
}

.error-page__code {
  margin: 16px 0 0;
  color: var(--color-blue-dark);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}

.error-page__title {
  @include section-title;

  margin: 12px 0;
}

.error-page__description {
  @include body-text;

  margin-bottom: 32px;
  color: var(--color-text-muted);
}
</style>
