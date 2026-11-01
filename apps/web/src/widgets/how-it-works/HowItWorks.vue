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
@use '@/assets/styles/mixins' as *;

.how-it-works {
  @include section;

  // Наезд на 1px на секцию выше: при дробной высоте той секции иначе проступает щель с фоном страницы
  margin-top: -1px;
  background:
    bokeh(var(--rgb-blue), 160px, -14% 200px, 0.49),
    bokeh(var(--rgb-blue), 140px, 114% 45%, 0.45),
    bokeh(var(--rgb-blue), 180px, -12% bottom 190px, 0.43),
    var(--color-white);
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
