<template>
  <section class="how-it-works" aria-labelledby="how-it-works-title" data-pcb>
    <PcbGlow />
    <h2 id="how-it-works-title" class="how-it-works__title">{{ t('home.howItWorks.title') }}</h2>

    <article class="how-it-works__role">
      <h3 class="how-it-works__role-title how-it-works__role-title--blue">{{ t('home.howItWorks.teachersTitle') }}</h3>
      <p class="how-it-works__text">
        {{ t('home.howItWorks.teachersText') }}
      </p>
    </article>

    <article class="how-it-works__role">
      <div class="how-it-works__nat how-it-works__nat--students">
        <NatStudents compact />
      </div>
      <h3 class="how-it-works__role-title how-it-works__role-title--green">{{ t('home.howItWorks.studentsTitle') }}</h3>
      <p class="how-it-works__text">
        {{ t('home.howItWorks.studentsText') }}
      </p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'
import { NatStudents, PcbGlow } from '@/shared'

const { t } = useI18n()
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.how-it-works {
  @include section;

  // Наезд на 1px на секцию выше: при дробной высоте той секции иначе проступает щель с фоном страницы
  margin-top: -1px;
  @include board-zones(radial-gradient(ellipse 60% 68% at 0% 45%, #000 0%, transparent 100%));

  background: var(--color-white);
}

.how-it-works__title {
  @include section-title;
}

.how-it-works__role + .how-it-works__role {
  margin-top: 16px;
}

.how-it-works__nat {
  --nat-unit: 0.34px;

  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.how-it-works__nat--students {
  margin-top: -10px;
}

.how-it-works__role-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;

  &::before {
    content: '';
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--role-color);
  }
}

.how-it-works__role-title--blue {
  --role-color: var(--color-blue);
}

.how-it-works__role-title--green {
  --role-color: var(--color-green);
}

.how-it-works__text {
  @include body-text;
}
</style>
