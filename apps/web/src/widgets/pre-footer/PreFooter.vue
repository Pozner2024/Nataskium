<template>
  <section class="pre-footer" aria-labelledby="pre-footer-title">
    <div class="pre-footer__content">
      <p class="pre-footer__eyebrow">Начните прямо сейчас</p>

      <h2 id="pre-footer-title" class="pre-footer__title">
        Готовы сделать занятие современным и <span class="pre-footer__accent">интересным?</span>
      </h2>

      <p class="pre-footer__description">Присоединяйтесь к Nataskium и превратите проверку знаний в игру.</p>

      <AppButton class="pre-footer__button" color="blue">Присоединиться бесплатно</AppButton>
    </div>

    <div class="pre-footer__nat">
      <div class="pre-footer__stars">
        <TwinklingStars :big-stars="BIG_STARS" :small-stars="SMALL_STARS" :seed="STARS_SEED" />
      </div>
      <NatBulb class="pre-footer__robot" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { AppButton, NatBulb, TwinklingStars } from '@/shared'
import type { StarPoint } from '@/shared'

const STARS_SEED = 23

const BIG_STARS: StarPoint[] = [
  [8, 30], [88, 22], [27, 62], [71, 70], [93, 58], [14, 84], [52, 92],
]

const SMALL_STARS: StarPoint[] = [
  [20, 15], [57, 10], [39, 40], [61, 28], [80, 45], [24, 40], [5, 55],
  [66, 52], [47, 70], [33, 88], [84, 84], [97, 90],
]
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

// --rgb-night-sky — цвет верха sky.webp
.pre-footer {
  --overlap: 40px;
  --padding-bottom: 24px;

  position: relative;
  z-index: var(--z-pre-footer);
  // Наезд на 1px на секцию выше: при дробной высоте той секции иначе проступает щель с фоном страницы
  margin-top: -1px;
  margin-bottom: calc(-1 * var(--overlap));
  padding: 32px var(--gutter) calc(var(--padding-bottom) + var(--overlap));
  text-align: center;
  background:
    linear-gradient(
        to bottom,
        rgb(var(--rgb-night-sky)) 0%,
        rgb(var(--rgb-night-sky) / 0.9) 25%,
        rgb(var(--rgb-night-sky) / 0.5) 50%,
        rgb(var(--rgb-night-sky) / 0.1) 75%,
        rgb(var(--rgb-night-sky) / 0) 100%
      )
      // +1px: при дробной высоте секции между слоями иначе остаётся щель в пиксель
      bottom / 100% calc(var(--overlap) + 1px) no-repeat,
    bokeh(var(--rgb-blue), 150px, -14% 190px, 0.36) no-repeat,
    bokeh(var(--rgb-blue), 140px, 114% 250px, 0.36) no-repeat,
    bokeh(var(--rgb-blue), 80px, 88% 90px, 0.3) no-repeat,
    linear-gradient(
        to bottom,
        var(--color-white) 0%,
        #edf6ff 18%,
        var(--bg-end) 40%,
        #91b8e9 62%,
        var(--color-blue) 80%,
        // Стопы до конца подобраны по кривой smootherstep: иначе на стыке с небом виден излом
        #416fef 84%,
        #305dd9 88%,
        #1743bb 92%,
        #0631a5 96%,
        rgb(var(--rgb-night-sky)) 100%
      )
      top / 100% calc(100% - var(--overlap)) no-repeat;
}

.pre-footer__eyebrow {
  margin: 0;
  // --color-blue на светлом верху градиента не дотягивает до контраста 4.5:1
  color: var(--color-blue-dark);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pre-footer__title {
  @include section-title;

  margin: 16px 0;
}

.pre-footer__accent {
  color: var(--color-blue);
}

.pre-footer__description {
  @include body-text;

  margin-bottom: 32px;
}

.pre-footer__button {
  margin-inline: auto;
}

.pre-footer__nat {
  --nat-unit: 0.34px;
  --nat-gap: 32px;
  --focus-color: var(--color-white);

  position: relative;
  display: flex;
  justify-content: center;
  margin-top: var(--nat-gap);
}

.pre-footer__stars {
  --star-size: 18px;
  --star-small-size: 6px;

  position: absolute;
  inset: calc(-1 * var(--nat-gap)) calc(-1 * var(--gutter)) calc(-1 * var(--padding-bottom));
  background: url('./images/stars.webp') top center / 266px auto;
  mix-blend-mode: screen;
  mask-image: linear-gradient(to bottom, transparent, var(--color-white) 35%);
  pointer-events: none;
}

// Позиционирован, чтобы рисоваться поверх звёзд, которые идут раньше в разметке
.pre-footer__robot {
  position: relative;

  // Фон вокруг робота идёт от светлого к тёмному: ни один цвет рамки не даёт на нём 3:1,
  // поэтому рамка лежит на тёмной подложке. 13px — отступ рамки 8px, её толщина 2px и край 3px
  &:focus-visible {
    box-shadow: 0 0 0 13px rgb(var(--rgb-night) / 0.5);
  }
}
</style>
