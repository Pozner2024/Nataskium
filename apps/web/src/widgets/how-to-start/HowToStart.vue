<template>
  <section class="how-to-start" aria-labelledby="how-to-start-title">
    <h2 id="how-to-start-title" class="how-to-start__title">Как начать</h2>

    <div class="how-to-start__nat">
      <NatGear compact />
    </div>

    <ol class="how-to-start__steps">
      <li class="how-to-start__step how-to-start__step--blue">
        Выберите формат задания (викторина, тест, сопоставление или игра) и шаблон оформления.
      </li>
      <li class="how-to-start__step how-to-start__step--green">
        Добавьте свои вопросы или попросите Ната помочь их составить.
      </li>
      <li class="how-to-start__step how-to-start__step--orange">
        Отправьте ссылку ученикам, и пусть учатся с удовольствием.
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { NatGear } from '@/shared'
</script>

<style scoped lang="scss">
.how-to-start {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 8px 20px 48px;
  // Зелёные пятна боке «рамкой»; каждое не ближе своего радиуса к верху и низу блока — без обрезов на стыках
  background:
    radial-gradient(circle 150px at -14% 170px, rgb(var(--rgb-green) / 0.53), rgb(var(--rgb-green) / 0.21) 60%, transparent),
    radial-gradient(circle 160px at 114% calc(100% - 170px), rgb(var(--rgb-green) / 0.45), rgb(var(--rgb-green) / 0.18) 60%, transparent),
    var(--color-white);
}

.how-to-start__title {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
}

.how-to-start__nat {
  // Тот же масштаб, что у Ната-лампочки в префутере (PreFooter)
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

// Номер шага — цифра «от руки» своим цветом бренда, как полоски бургера. Рисуется маской: цвет из переменной.
// Тёмные оттенки зелёного и оранжевого — чтобы цифра читалась на белом (основной оранжевый даёт 2.5:1).
// Ширина 26px — как галочки в «Почему выбирают»: текст обоих списков начинается с одной линии.
// Сам номер для скринридеров даёт нумерованный список <ol>
.how-to-start__step {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.5;

  &::before {
    content: '';
    flex: none;
    width: 26px;
    height: 26px;
    margin-top: -1px;
    background: var(--step-color);
    mask: var(--step-digit) center / contain no-repeat;
  }
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
