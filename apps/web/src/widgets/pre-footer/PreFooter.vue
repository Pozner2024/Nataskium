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
// Низ секции заходит на картинку футера и растворяется: у неба есть зерно и звёзды,
// и стык гладкого градиента с ним без растворения виден как полоса.
// --rgb-night-sky — цвет верха sky.webp
.pre-footer {
  --overlap: 40px;
  --padding-x: 20px;
  --padding-bottom: 24px;

  position: relative;
  z-index: var(--z-pre-footer);
  // Наезд на 1px на секцию выше: при дробной высоте той секции иначе проступает щель с фоном страницы
  margin-top: -1px;
  margin-bottom: calc(-1 * var(--overlap));
  padding: 32px var(--padding-x) calc(var(--padding-bottom) + var(--overlap));
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
    // Голубые пятна боке в светлой верхней части (ниже их съедает синий градиент); не ближе своего радиуса к верху блока
    radial-gradient(circle 150px at -14% 190px, rgb(var(--rgb-blue) / 0.36), rgb(var(--rgb-blue) / 0.14) 60%, transparent) no-repeat,
    radial-gradient(circle 140px at 114% 250px, rgb(var(--rgb-blue) / 0.36), rgb(var(--rgb-blue) / 0.14) 60%, transparent) no-repeat,
    radial-gradient(circle 80px at 88% 90px, rgb(var(--rgb-blue) / 0.3), rgb(var(--rgb-blue) / 0.1) 60%, transparent) no-repeat,
    linear-gradient(
        to bottom,
        var(--color-white) 0%,
        #edf6ff 18%,
        var(--bg-end) 40%,
        #91b8e9 62%,
        var(--color-blue) 80%,
        // Синий → небо по кривой smootherstep: к низу цвет меняется всё медленнее, без излома на стыке
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
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pre-footer__title {
  margin: 16px 0;
  color: var(--color-text);
  font-family: var(--font-display);
  // Как заголовки остальных блоков главной («Как начать» и др.)
  font-size: 26px;
  line-height: 1.1;
}

.pre-footer__accent {
  color: var(--color-blue);
}

.pre-footer__description {
  margin: 0 0 32px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.pre-footer__button {
  margin-inline: auto;
}

.pre-footer__nat {
  // Нат меньше, чем в остальных сценах: здесь он акцент, а не герой
  --nat-unit: 0.34px;
  --nat-gap: 32px;

  position: relative;
  display: flex;
  justify-content: center;
  margin-top: var(--nat-gap);
}

// Звёзды неба футера продолжаются вверх по градиенту до кнопки и растворяются к ней
.pre-footer__stars {
  --star-size: 18px;
  --star-small-size: 6px;

  position: absolute;
  inset: calc(-1 * var(--nat-gap)) calc(-1 * var(--padding-x)) calc(-1 * var(--padding-bottom));
  // stars.webp — звёзды с верха sky.webp на чёрном (фон неба вычтен), в масштабе сцены футера на мобильном.
  // screen: чёрное не меняет градиент, звёзды светятся поверх
  background: url('./images/stars.webp') top center / 266px auto;
  mix-blend-mode: screen;
  mask-image: linear-gradient(to bottom, transparent, var(--color-white) 35%);
  pointer-events: none;
}

// Позиционирован, чтобы рисоваться поверх звёзд, которые идут раньше в разметке
.pre-footer__robot {
  position: relative;
}
</style>
