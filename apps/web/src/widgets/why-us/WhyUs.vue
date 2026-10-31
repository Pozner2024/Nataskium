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
.why-us {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 8px 20px 48px;
  // Оранжевые пятна боке «рамкой»; каждое не ближе своего радиуса к верху и низу блока — без обрезов на стыках
  background:
    radial-gradient(circle 150px at 114% 180px, rgb(var(--rgb-orange) / 0.49), rgb(var(--rgb-orange) / 0.2) 60%, transparent),
    radial-gradient(circle 140px at -14% 50%, rgb(var(--rgb-orange) / 0.45), rgb(var(--rgb-orange) / 0.18) 60%, transparent),
    radial-gradient(circle 170px at 112% calc(100% - 180px), rgb(var(--rgb-orange) / 0.43), rgb(var(--rgb-orange) / 0.16) 60%, transparent),
    var(--color-white);
}

.why-us__title {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
}

.why-us__nat {
  // Тот же масштаб, что у Ната-лампочки в префутере (PreFooter)
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

// Галочка «от руки»: несимметричная, с чуть изогнутым длинным штрихом, как карандашом;
// толщина 4.5 — как у оранжевой волны под заголовком первого экрана.
// Рисуется маской, чтобы цвет брался из переменной бренда. Ширина 26px — как кружки номеров
// «Как начать»: текст обоих списков начинается с одной линии
.why-us__item {
  display: flex;
  align-items: flex-start;
  gap: 14px;

  &::before {
    content: '';
    flex: none;
    width: 26px;
    height: 26px;
    margin-top: -1px;
    background: var(--color-green);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26' fill='none' stroke='black' stroke-width='4.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.6 14.4c1.7.5 3.4 2 4.6 4.1.5.8.9 1.6 1.2 2.3'/%3E%3Cpath d='M9.4 20.6c1.8-4.6 4.9-9.4 8.6-13.1 1.6-1.6 3.1-2.8 4.6-3.7'/%3E%3C/svg%3E") center / contain no-repeat;
  }
}

.why-us__text {
  margin: 0;
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.5;
}

.why-us__lead {
  font-weight: 700;
}
</style>
