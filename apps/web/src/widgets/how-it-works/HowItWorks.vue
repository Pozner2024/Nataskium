<template>
  <section class="how-it-works" aria-labelledby="how-it-works-title">
    <h2 id="how-it-works-title" class="how-it-works__title">Как это работает</h2>

    <article class="how-it-works__role">
      <h3 class="how-it-works__role-title how-it-works__role-title--blue">Учителя и репетиторы</h3>
      <p class="how-it-works__text">
        Создают наборы заданий и сами решают, ставить ли оценку. Если оценка нужна, выбирают готовые критерии оценивания или создают свои. Когда задание готово, остаётся отправить ученикам ссылку.
      </p>
    </article>

    <article class="how-it-works__role">
      <div class="how-it-works__nat how-it-works__nat--students">
        <NatStudents compact />
      </div>
      <h3 class="how-it-works__role-title how-it-works__role-title--green">Ученики и студенты</h3>
      <p class="how-it-works__text">
        Отвечают на вопросы с личных телефонов, планшетов и компьютеров или с устройств в классе. Регистрироваться не нужно: достаточно открыть ссылку. В конце задания сразу видят свой результат и оценку.
      </p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { NatStudents } from '@/shared'
</script>

<style scoped lang="scss">
.how-it-works {
  display: flex;
  flex-direction: column;
  // От заголовка до содержимого 24px, как в остальных блоках; между ролями — 40px (ниже)
  gap: 24px;
  // Сверху почти без отступа: у первого экрана над этим блоком уже свой нижний отступ
  padding: 8px 20px 48px;
  // Наезд на 1px на секцию выше: при дробной высоте той секции иначе проступает щель с фоном страницы
  margin-top: -1px;
  // Голубые пятна боке «рамкой». Каждое стоит не ближе своего радиуса к верху и низу блока,
  // иначе его обрежет ровной линией на стыке с соседней секцией
  background:
    radial-gradient(circle 160px at -14% 200px, rgb(var(--rgb-blue) / 0.49), rgb(var(--rgb-blue) / 0.2) 60%, transparent),
    radial-gradient(circle 140px at 114% 45%, rgb(var(--rgb-blue) / 0.45), rgb(var(--rgb-blue) / 0.18) 60%, transparent),
    radial-gradient(circle 180px at -12% calc(100% - 190px), rgb(var(--rgb-blue) / 0.43), rgb(var(--rgb-blue) / 0.16) 60%, transparent),
    var(--color-white);
}

.how-it-works__title {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
}

.how-it-works__role + .how-it-works__role {
  margin-top: 16px;
}

.how-it-works__nat {
  // Тот же масштаб, что у музыкального Ната и Ната-лампочки
  --nat-unit: 0.34px;

  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.how-it-works__nat--students {
  margin-top: -10px;
}

// Цветная точка перед ролью — как у пунктов меню
.how-it-works__role-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
  color: var(--color-text);
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
  margin: 0;
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.5;
}
</style>
