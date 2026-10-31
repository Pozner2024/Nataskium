<template>
  <section class="home-hero" aria-labelledby="home-hero-title">
    <h1 id="home-hero-title" class="home-hero__title">
      Учи легко,<br>
      учись
      <span class="home-hero__title-mark">
        весело
        <svg class="home-hero__title-wave" viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">
          <path d="M3 8 Q 10 0 17 8 T 31 8 T 45 8 T 59 8 T 73 8 T 87 8 T 101 8 T 115 8" vector-effect="non-scaling-stroke" />
        </svg>
        <svg class="home-hero__title-sparks" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 10 L9 3 M11 13 L20 11 M8 19 L15 20" />
        </svg>
      </span>
    </h1>

    <div class="home-hero__nat">
      <NatCards compact />
    </div>

    <ul class="home-hero__points">
      <li class="home-hero__point">
        <span class="home-hero__icon home-hero__icon--blue" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <rect x="3.5" y="2.5" width="13" height="17" rx="3" fill="#fff" />
            <path d="M7 7.5h6M7 11h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="17.5" cy="17.5" r="5" fill="currentColor" stroke="#fff" stroke-width="1.8" />
            <path d="M17.5 15.3v4.4M15.3 17.5h4.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </span>
        <p class="home-hero__text">Создайте интерактивное задание за пару минут и отправьте ссылку ученикам.</p>
      </li>
      <li class="home-hero__point">
        <span class="home-hero__icon home-hero__icon--green" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="#fff">
            <rect x="3.5" y="13" width="4.5" height="8" rx="2" />
            <rect x="9.75" y="8.5" width="4.5" height="12.5" rx="2" />
            <rect x="16" y="3" width="4.5" height="18" rx="2" />
          </svg>
        </span>
        <p class="home-hero__text">Решайте сами, ставить ли оценку и по каким критериям оценивания.</p>
      </li>
      <li class="home-hero__point">
        <span class="home-hero__icon home-hero__icon--orange" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 17.5h6M10 21h4" />
            <path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8.9.8 1.5v1.7h6v-1.7c0-.6.3-1.1.8-1.5A6.5 6.5 0 0 0 12 2.5Z" />
          </svg>
        </span>
        <p class="home-hero__text">Обращайтесь к Нату, вашему виртуальному помощнику: он подскажет, с чего начать, и поможет собрать интерактивное задание быстрее.</p>
      </li>
    </ul>

    <AppButton class="home-hero__button">Создать задание бесплатно</AppButton>
  </section>
</template>

<script setup lang="ts">
import { AppButton, NatCards } from '@/shared'
</script>

<style scoped lang="scss">
// Пятна боке «рамкой»: крупные по краям, центр с текстом чистый.
// Верхнее голубое продолжает пятно в углу шапки (AppHeader, hasGlow) — его центр и цвета должны совпадать.
// Нижние стоят на радиус выше низа блока: иначе их обрежет ровной линией на стыке со следующей секцией
.home-hero {
  // «Искорки» у заголовка на экранах 320px выступают за край — без горизонтальной прокрутки страницы
  overflow-x: clip;
  padding: 32px 20px 48px;
  background:
    radial-gradient(circle 200px at 112% -18px, rgb(var(--rgb-blue) / 0.38), rgb(var(--rgb-blue) / 0.16) 60%, transparent),
    radial-gradient(circle 145px at -14% 170px, rgb(var(--rgb-orange) / 0.33), rgb(var(--rgb-orange) / 0.12) 60%, transparent),
    radial-gradient(circle 155px at -16% 42%, rgb(var(--rgb-green) / 0.43), rgb(var(--rgb-green) / 0.18) 60%, transparent),
    radial-gradient(circle 145px at 114% 50%, rgb(var(--rgb-orange) / 0.4), rgb(var(--rgb-orange) / 0.15) 60%, transparent),
    radial-gradient(circle 220px at -16% calc(100% - 230px), rgb(var(--rgb-blue) / 0.36), rgb(var(--rgb-blue) / 0.14) 60%, transparent),
    radial-gradient(circle 225px at 116% calc(100% - 235px), rgb(var(--rgb-green) / 0.4), rgb(var(--rgb-green) / 0.15) 60%, transparent),
    var(--color-white);
}

.home-hero__title {
  margin: 0 0 24px;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.15;
}

// Слово-акцент: оранжевая волна под ним и «искорки» справа сверху
.home-hero__title-mark {
  position: relative;
  display: inline-block;
}

.home-hero__title-wave,
.home-hero__title-sparks {
  position: absolute;
  overflow: visible;
  fill: none;
  stroke: var(--color-orange);
  stroke-linecap: round;
}

.home-hero__title-wave {
  bottom: -12px;
  left: 0;
  width: 100%;
  height: 12px;
  stroke-width: 4.5px;
}

.home-hero__title-sparks {
  top: -10px;
  right: -26px;
  width: 24px;
  height: 24px;
  stroke-width: 3px;
}

.home-hero__points {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0 0 28px;
  padding: 0;
  list-style: none;
}

.home-hero__point {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

// Плашки как у карточек Ната: градиент от светлого цвета бренда к основному, значок белый.
// color — основной цвет, им же рисуются детали значка на белом
.home-hero__icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  // Верх плашки — на уровне верха букв первой строки, а не верха её строчного блока
  margin-top: 4px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--icon-light), var(--icon-base));

  svg {
    width: 20px;
    height: 20px;
  }
}

.home-hero__icon--blue {
  --icon-light: var(--color-blue-light);
  --icon-base: var(--color-blue);

  color: var(--color-blue);

  // Документ с плюсом визуально мельче столбиков и лампочки — выравниваем
  svg {
    width: 23px;
    height: 23px;
  }
}

.home-hero__icon--green {
  --icon-light: var(--color-green-light);
  --icon-base: var(--color-green);

  color: var(--color-green);
}

.home-hero__icon--orange {
  --icon-light: var(--color-orange-light);
  --icon-base: var(--color-orange);

  color: var(--color-orange);
}

.home-hero__text {
  margin: 0;
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.35;
}

.home-hero__button {
  margin-inline: auto;
}

.home-hero__nat {
  // Компактная сцена 640 единиц в ширину → около 295px
  --nat-unit: 0.46px;

  display: flex;
  justify-content: center;
  margin-bottom: 18px;
}
</style>
