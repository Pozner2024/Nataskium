<template>
  <section class="how-to-start" aria-labelledby="how-to-start-title" data-pcb>
    <div class="how-to-start__fade" aria-hidden="true" />
    <h2 id="how-to-start-title" class="how-to-start__title">{{ t('home.howToStart.title') }}</h2>

    <div class="how-to-start__nat">
      <NatGear compact />
    </div>

    <ol class="how-to-start__steps">
      <li class="how-to-start__step how-to-start__step--blue">
        {{ t('home.howToStart.stepFormat') }}
      </li>
      <li class="how-to-start__step how-to-start__step--green">
        {{ t('home.howToStart.stepQuestions') }}
      </li>
      <li class="how-to-start__step how-to-start__step--orange">
        {{ t('home.howToStart.stepShare') }}
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'
import { NatGear } from '@/shared'

const { t } = useI18n()
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.how-to-start {
  @include section;

  @include board-zones(
    radial-gradient(ellipse 68% 52% at 0% 20%, #000 0%, transparent 100%),
    radial-gradient(ellipse 68% 52% at 100% 85%, #000 0%, transparent 100%)
  );

  background: var(--color-white);

}

// Узор у нижнего края секции плавно уходит в белый. Отдельный элемент, чтобы не перекрывать ::after с узором
.how-to-start__fade {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent 88%, var(--color-white) 100%);
}

.how-to-start__title {
  @include section-title;
}

.how-to-start__nat {
  --nat-unit: 0.34px;

  display: flex;
  justify-content: center;
  margin-top: -10px;
}

.how-to-start__steps {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

// Тёмные оттенки зелёного и оранжевого — чтобы цифра читалась на белом (основной оранжевый даёт 2.5:1).
.how-to-start__step {
  @include body-text;
  @include list-item(var(--step-color), var(--step-digit));
}

.how-to-start__step--blue {
  --step-color: var(--color-blue);
  --step-digit: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26' fill='none' stroke='black' stroke-width='3.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8.3 8.6c2.1-1.3 3.7-2.9 5.2-4.9'/%3E%3Cpath d='M13.5 3.9c-.3 5.8-.3 11.9 0 18.3'/%3E%3C/svg%3E");
}

.how-to-start__step--green {
  --step-color: var(--color-green-dark);
  --step-digit: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26' fill='none' stroke='black' stroke-width='3.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6.8 8.9c.6-3.6 3.9-5.5 7.1-4.7 3.5.9 4.2 4.3 2.1 7-2.5 3.4-6.1 6.6-9.5 10.3 4.2-.6 8.7-.7 12.7-.2'/%3E%3C/svg%3E");
}

.how-to-start__step--orange {
  --step-color: var(--color-orange-dark);
  --step-digit: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26' fill='none' stroke='black' stroke-width='3.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7.2 6.1c2.8-2.3 8.4-2.6 9.6.3 1 2.5-1.7 4.5-4.9 5.1 3.9-.3 6.9 1.7 6.6 4.9-.4 3.9-6.9 5.6-11.3 3.5'/%3E%3C/svg%3E");
}
</style>
