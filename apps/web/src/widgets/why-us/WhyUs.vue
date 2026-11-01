<template>
  <section class="why-us" aria-labelledby="why-us-title">
    <h2 id="why-us-title" class="why-us__title">Почему выбирают Nataskium</h2>

    <div class="why-us__nat">
      <NatMusic compact />
    </div>

    <ul class="why-us__list">
      <li v-for="reason in REASONS" :key="reason.title" class="why-us__item">
        <p class="why-us__text">
          <strong class="why-us__lead">{{ reason.title }}</strong>
          {{ reason.text }}
        </p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { NatMusic } from '@/shared'

interface Reason {
  title: string
  text: string
}

const REASONS: Reason[] = [
  { title: 'Дружелюбный интерфейс и яркие шаблоны,', text: 'которые удерживают внимание учеников.' },
  { title: 'Задание создаётся быстро и легко:', text: 'разобраться можно без инструкций или с подсказками Ната, вашего виртуального помощника.' },
  { title: 'Оценивание по вашим правилам:', text: 'готовые критерии оценивания или свои собственные.' },
  { title: 'Задания можно слушать:', text: 'вопросы и варианты ответов озвучиваются. Удобно малышам, которые ещё плохо читают, и на уроках иностранного языка.' },
  { title: 'Библиотека готовых заданий:', text: 'можно взять готовое и сразу отправить ученикам.' },
]
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.why-us {
  @include section;

  background:
    bokeh(var(--rgb-orange), 150px, 114% 180px, 0.49),
    bokeh(var(--rgb-orange), 140px, -14% 50%, 0.45),
    bokeh(var(--rgb-orange), 170px, 112% bottom 180px, 0.43),
    var(--color-white);
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
