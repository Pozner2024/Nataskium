<template>
  <section class="why-us" aria-labelledby="why-us-title" data-pcb>
    <PcbGlow />
    <h2 id="why-us-title" class="why-us__title">{{ t('home.whyUs.title') }}</h2>

    <div class="why-us__nat">
      <NatMusic compact />
    </div>

    <ul class="why-us__list">
      <li v-for="reason in reasons" :key="reason.key" class="why-us__item">
        <p class="why-us__text">
          <strong class="why-us__lead">{{ reason.title }}</strong>
          {{ reason.text }}
        </p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import { NatMusic, PcbGlow } from '@/shared'

const REASON_KEYS = ['friendly', 'quick', 'grading', 'audio', 'library'] as const

const { t } = useI18n()
const reasons = computed(() =>
  REASON_KEYS.map((key) => ({
    key,
    title: t(`home.whyUs.reasons.${key}.title`),
    text: t(`home.whyUs.reasons.${key}.text`),
  })),
)
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.why-us {
  @include section;

  @include board-zones(
    radial-gradient(ellipse 60% 34% at 100% 35%, #000 0%, transparent 100%),
    radial-gradient(ellipse 36% 42% at 60% 30%, #000 0%, transparent 100%)
  );

  background: var(--color-white);
}

.why-us__title {
  @include section-title;
}

.why-us__nat {
  --nat-unit: 0.34px;

  display: flex;
  justify-content: center;
}

.why-us__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.why-us__item {
  --check: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26' fill='none' stroke='black' stroke-width='4.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.6 14.4c1.7.5 3.4 2 4.6 4.1.5.8.9 1.6 1.2 2.3'/%3E%3Cpath d='M9.4 20.6c1.8-4.6 4.9-9.4 8.6-13.1 1.6-1.6 3.1-2.8 4.6-3.7'/%3E%3C/svg%3E");

  @include list-item(var(--color-green), var(--check));
}

.why-us__text {
  @include body-text;
}

.why-us__lead {
  font-weight: 700;
}
</style>
