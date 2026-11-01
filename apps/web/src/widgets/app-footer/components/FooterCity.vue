<template>
  <div class="footer-city" aria-hidden="true">
    <!-- Слои идут снизу вверх: небо → облака → город с прозрачным небом → огни и транспорт → деревья → фонари -->
    <div class="footer-city__stage">
      <img class="footer-city__layer" :src="skyImage" alt="" loading="lazy">
      <CityStars />
      <img class="footer-city__cloud footer-city__cloud--left" :src="cloudsLeftImage" alt="" loading="lazy">
      <img class="footer-city__cloud footer-city__cloud--right" :src="cloudsRightImage" alt="" loading="lazy">
      <img class="footer-city__layer footer-city__layer--city" :src="cityImage" alt="" loading="lazy">

      <CityWater />
      <CityFlask />

      <div
        v-for="heli in HELICOPTERS"
        :key="heli.modifier"
        class="footer-city__lane footer-city__heli-lane"
        :class="`footer-city__heli-lane--${heli.modifier}`"
      >
        <div class="footer-city__heli">
          <div class="footer-city__heli-body">
            <div class="footer-city__heli-tilt">
              <img class="footer-city__image" :src="heliImage" alt="" loading="lazy">
              <span class="footer-city__rotor" />
            </div>
          </div>
        </div>
      </div>

      <!-- Дальняя полоса первой, чтобы ближняя была поверх -->
      <div
        v-for="truck in TRUCKS"
        :key="truck.modifier"
        class="footer-city__lane footer-city__truck-lane"
        :class="`footer-city__truck-lane--${truck.modifier}`"
      >
        <div class="footer-city__truck">
          <img class="footer-city__image" :src="truckImage" alt="" loading="lazy">
        </div>
      </div>

      <!-- Деревья, вырезанные из фона: грузовички уезжают за них -->
      <img class="footer-city__trees footer-city__trees--left" :src="treesLeftImage" alt="" loading="lazy">
      <img class="footer-city__trees footer-city__trees--right" :src="treesRightImage" alt="" loading="lazy">

      <CityLamps />
    </div>
  </div>
</template>

<script setup lang="ts">
import CityFlask from './CityFlask.vue'
import CityLamps from './CityLamps.vue'
import CityStars from './CityStars.vue'
import CityWater from './CityWater.vue'
import cityImage from '../images/city.webp'
import cloudsLeftImage from '../images/clouds-left.webp'
import cloudsRightImage from '../images/clouds-right.webp'
import heliImage from '../images/heli.webp'
import skyImage from '../images/sky.webp'
import treesLeftImage from '../images/trees-left.webp'
import treesRightImage from '../images/trees-right.webp'
import truckImage from '../images/truck.webp'

const HELICOPTERS = [{ modifier: 'front' }, { modifier: 'back' }]
const TRUCKS = [{ modifier: 'back' }, { modifier: 'front' }]
</script>

<style scoped lang="scss">
$scene-min-width: 800px;

.footer-city {
  position: relative;
  width: max(100%, $scene-min-width);
  // Когда экран уже сцены, отступ сдвигает её влево на половину лишней ширины: в кадре остаётся середина города
  margin-left: min(0px, calc((100% - #{$scene-min-width}) / 2));
  aspect-ratio: 2067 / 630;
  overflow: hidden;
}

// Слои нарезаны из полной картинки 2078×757, обрезанная начинается с точки (11, 5)
.footer-city__stage {
  position: absolute;
  top: -0.794%;
  left: -0.532%;
  width: 100.532%;
  aspect-ratio: 2078 / 757;
}

.footer-city__layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.footer-city__layer--city {
  top: 22.985%;
}

.footer-city__image {
  display: block;
  width: 100%;
}

.footer-city__lane {
  position: absolute;
  inset: 0;
}

.footer-city__cloud {
  position: absolute;
  animation: breathe ease-in-out infinite;
}

.footer-city__cloud--left {
  top: 12.417%;
  left: 0;
  width: 46.391%;
  transform-origin: 0 40%;
  animation-duration: 10s;
}

.footer-city__cloud--right {
  top: 10.832%;
  left: 55.39%;
  width: 44.61%;
  transform-origin: 100% 40%;
  animation-duration: 11s;
  animation-delay: -4s;
}

@keyframes breathe {
  0%,
  100% { transform: translateY(0) scale(1); opacity: 0.94; }
  50% { transform: translateY(-2%) scale(1.05, 1.065); opacity: 1; }
}

.footer-city__heli-lane--front {
  transform: translateX(25%);
  animation: fly-right 42s linear infinite;
}

.footer-city__heli-lane--back {
  transform: translateX(65%);
  animation: fly-left 58s linear -24s infinite;
}

.footer-city__heli {
  position: absolute;
  top: 17%;
  left: 0;
  width: 8.2%;
}

.footer-city__heli-lane--back .footer-city__heli {
  top: 25%;
  width: 7%;
}

.footer-city__heli-body {
  position: relative;
  animation: hover 3.2s ease-in-out infinite alternate;
}

.footer-city__heli-lane--back .footer-city__heli-body {
  animation-duration: 3.8s;
}

.footer-city__heli-tilt {
  transform: rotate(4deg);
}

.footer-city__heli-lane--back .footer-city__heli-tilt {
  transform: scaleX(-1) rotate(4deg);
}

.footer-city__rotor {
  position: absolute;
  top: 0;
  left: 4%;
  width: 92%;
  height: 27%;
  overflow: hidden;
  border-radius: 50%;
  mix-blend-mode: screen;

  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    aspect-ratio: 1;
    background: conic-gradient(transparent 0 290deg, rgb(var(--rgb-cool-light) / 0.75) 345deg, transparent 360deg);
    translate: 0 -50%;
    animation: spin 0.45s linear infinite;
  }
}

@keyframes fly-right {
  from { transform: translateX(-12%); }
  to { transform: translateX(108%); }
}

@keyframes fly-left {
  from { transform: translateX(108%); }
  to { transform: translateX(-12%); }
}

@keyframes hover {
  from { translate: 0 -6%; }
  to { translate: 0 6%; }
}

@keyframes spin {
  to { rotate: 360deg; }
}

.footer-city__truck-lane--front {
  transform: translateX(35%);
  animation: drive-right 36s linear infinite;
}

.footer-city__truck-lane--back {
  transform: translateX(60%);
  animation: drive-left 42s linear -14s infinite;
}

.footer-city__truck {
  position: absolute;
  bottom: 28.4%;
  left: 0;
  width: 4.6%;

  .footer-city__image {
    animation: bump 0.36s ease-in-out infinite alternate;
  }
}

.footer-city__truck-lane--back .footer-city__truck {
  bottom: 28.9%;
  width: 4.3%;

  .footer-city__image {
    transform: scaleX(-1);
    animation-name: bump-back;
  }
}

@keyframes drive-right {
  0% { transform: translateX(-6%); }
  82%,
  100% { transform: translateX(101%); }
}

@keyframes drive-left {
  0% { transform: translateX(101%); }
  82%,
  100% { transform: translateX(-6%); }
}

@keyframes bump {
  from { translate: 0 0; }
  to { translate: 0 -2.5%; }
}

@keyframes bump-back {
  from { translate: 0 0; rotate: 0deg; }
  to { translate: 0 -2.5%; rotate: 0.6deg; }
}

.footer-city__trees {
  position: absolute;
  top: 54.954%;
  height: 25.099%;
}

.footer-city__trees--left {
  left: 0;
  width: 25.602%;
}

.footer-city__trees--right {
  left: 87.777%;
  width: 12.223%;
}
</style>
