<template>
  <svg
    ref="root"
    class="app-logo"
    :class="{ 'app-logo--on-dark': onDark }"
    viewBox="145 170 1880 357"
    role="img"
    aria-label="Nataskium"
  >
    <path class="app-logo__nat" fill-rule="evenodd" d="M377.3 248c-7.2 4.4-6.8-0.4-6.5 75.5 0.1 37.4-0.1 69.3-0.6 70.9-0.7 2.7-2.5 0.9-55.2-57-73.7-81-78.8-86.4-82.6-88-5-2.1-61.3-2-65.4 0.1-6.4 3.3-6-5.9-6 124.2l0 118.3 2.9 3.2 2.9 3.3 30.5-0c29.1-0 30.6-0.1 32.7-2 5-4.5 5-3.9 5.1-74.7l0-66.3 11.7 12.3c6.4 6.8 36.2 38.3 66.2 70 30 31.7 56.1 58.5 58 59.7 5 2.9 65.4 3.1 70.7 0.2 6.7-3.6 6.3 4.5 6.3-124.4 0-130.6 0.5-121.8-7-125.5-5.6-2.8-59.1-2.7-63.7 0.2zM767.9 260.3c-5.2 3.5-5.8 6.5-5.8 31.4l-0.1 22.3-12-0c-20.2-0-21.9 2.1-22 27.5 0 24.4 1.8 26.5 22.2 26.5l11.6-0 0.5 40.7c0.4 45.3 0.7 47.6 7.2 60.8 12.3 24.7 42 37.2 80.3 33.7 18.8-1.7 40.2-8.4 43.7-13.8 2.4-3.6 1.9-6.5-4-25-7.1-22.3-7.6-22.7-21.6-17.8-16.5 5.7-29 1.3-31.9-11.2-0.5-2.1-1-18.2-1-35.7l0-31.7 20.3-0c24-0.1 27.8-0.7 32.1-4.9l3.1-3.1 0.3-18c0.5-28.3 1.6-27.3-31.3-28l-24-0.5-0.5-24c-0.4-16.9-0.9-24.7-1.8-26.2-2.8-5-5.1-5.3-34.5-5.3-26.9-0-27.5-0-30.8 2.3zM573.6 287.6c-61.3 11.1-109.1 69.8-102.8 126.1 6.4 56.1 50.3 95 110.7 98.1 35.7 1.9 65.1-5.1 84.8-20.2 5.8-4.4 5.7-4.4 5.7-0.1 0 10.1 3.2 11.5 26.9 11.5 18.5-0 18.9-0 21.4-2.4 1.4-1.3 2.9-3.5 3.2-4.8 0.3-1.3 0.4-26.2 0.2-55.3-0.4-59-0.3-57.8-7.7-76.2-15.2-37.9-55.1-69.4-97.4-76.8-11-1.9-34.2-1.9-45 0.1zm47.6 50.8c24.2 6.2 40.8 20.7 48.3 42.3 11.7 33.6-0.9 66.7-31.1 81.4-22.6 11.1-61.7 11-84.3-0.2-38.4-19-46.8-73.6-16.2-104.7 19-19.2 52.2-26.7 83.3-18.8z" />
    <path class="app-logo__askium" fill-rule="evenodd" d="M584.5 186.4c-18 7.5-26.3 29.4-17.7 46.9 3.8 7.6 11 14.7 17.7 17.3l4.5 1.7 0 16.8 0 16.9 8-0 8-0 0-17c0-15.4 0.2-17.1 1.8-17.6 8.5-2.7 17.8-10.7 21.3-18.7 5.4-11.9 2.5-28.5-6.6-38.5-8.5-9.5-24.7-12.9-37-7.8zM1465.5 238.3c-23.7 7.8-31.4 36.4-14.4 53.8 7.2 7.4 12.3 9.4 23.9 9.4 11.4-0 16.7-2.3 24.1-10.2 14.9-15.9 10.2-40.9-9.6-51.1-6-3-17.6-4-24-1.9zM1260.8 249.7c-1.4 0.9-3.1 2.7-3.7 4-2 4.3-1.5 237.3 0.5 240.1 3.2 4.7 6 5.2 26.4 5.2 29.5-0 29 0.5 29-28.7l0-19.8 7.2-7.2 7.2-7.2 5.6 7.7c3.1 4.2 12.8 17.6 21.4 29.7 12.5 17.5 16.5 22.4 19.4 23.7 3.3 1.6 6.8 1.8 31 1.5l27.4-0.2 1.9-2.4c3.7-4.6 2.6-8.4-5.9-20-20.3-27.5-55.5-76.3-57.6-79.8-0.7-1.3 15.6-19 47.2-51.5 17-17.4 18.1-19.7 12.6-24.9l-2.6-2.4-27.1-0c-15-0-28.4 0.3-29.9 0.8-2.6 0.7-7.7 6.3-40.9 44.7-6.4 7.4-12.8 14.8-14.2 16.5l-2.6 3-0.1-63.7 0-63.8-2.9-3.2-2.9-3.3-21.9-0.3c-19-0.2-22.1-0-24.5 1.5zM977.5 313.1c-15.7 1.6-33 6.4-47.5 13.1-14.7 6.7-15 8.7-4.5 29 9.8 19 9.4 18.8 25.3 12.5 33-13.1 57.6-10.7 66.4 6.3 3.7 6.9 4 14.3 0.6 13.5-30.2-6.6-68.5 0.4-90.3 16.7-20.4 15.2-27.1 42.3-16 65.6 17.4 36.7 76.2 45.8 108.3 16.7l3.9-3.5 0.6 4.7c0.4 3.7 1.2 5.4 3.6 7.5l3.1 2.8 19.8-0c21.5-0 25.4-0.9 26.7-6.3 0.4-1.2 0.5-29.3 0.3-62.2-0.4-66-0.4-65.9-7.2-79.3-14-27.7-49.1-41.7-93.1-37.1zm37.4 111.6l5.3 0.6-0.4 7.7c-0.9 16.2-12.3 26.7-29.9 27.8-18.6 1.1-29.8-10.6-23.3-24.4 1.3-2.7 9.1-9.3 11.3-9.4 0.3-0.1 2.9-0.7 5.6-1.5 5.3-1.4 22.4-1.9 31.4-0.8zM1148.7 313c-34.3 5.8-55.8 28.2-55.7 58.1 0.1 29.2 15.8 44.5 62 60.4 18.9 6.5 23.6 8.9 25.6 12.7 4.5 8.8-3 14.8-18.3 14.8-11.8-0-20.9-2.6-36-10.1-16.8-8.5-16-8.8-27.2 10.7-9.5 16.5-9.9 18.8-4.4 23.3 4.8 3.9 22 12.4 30.6 15 28.4 8.6 61 7.3 83-3.3 33.2-16 41.8-58.9 16.8-84.4-8.7-8.9-19.8-14.8-46.1-24.7-21.1-7.8-24.8-9.8-26.6-14.1-1.3-3-1.3-3.8 0.1-6.4 5.1-9.8 26.6-9 49.9 2 13.2 6.2 13.7 6 24.5-13.2 10.2-18.4 9.9-20.5-4.8-28.2-20.4-10.7-52.1-16.1-73.4-12.6zM1927.3 314.1c-19.5 2.3-39.8 14.6-50 30.2l-3.1 4.8-3.8-6.3c-20-32.8-64-38.6-93.2-12.3l-6 5.5-0.4-6c-0.3-4.9-1-6.5-3.3-9l-2.9-3-21.7-0c-24.4-0-25.8 0.4-27.9 7.8-0.8 2.5-1 29.2-0.8 84.9l0.3 81.3 3.3 3.2 3.2 3.3 20.2 0.3c21 0.3 23.9-0.1 27.5-4 1.7-1.9 1.8-5.5 2.3-52.7l0.5-50.6 2.6-5.5c3.7-7.8 7.1-11.4 14.1-14.9 11.6-5.9 24.6-3.8 32.2 5.1 7.1 8.2 7 7.5 7.6 65l0.5 51.8 2.8 2.7 2.7 2.8 23.8 0.3c25.1 0.4 28.7-0.2 30.9-4.7 0.4-0.9 1-24.1 1.3-51.6 0.6-56.7 0.4-55.3 8.9-64.7 10.4-11.6 26.7-13.1 37.6-3.6 10.8 9.5 11.5 13.8 11.5 71.5l0 46.3 2.9 3.2 2.9 3.3 25.1-0 25.1-0 2.7-2.8 2.8-2.7 0-59.8c0-66.5 0-66.2-7-80.7-13-26.8-43.1-42.2-75.2-38.4zM1449.8 320.9l-3.3 2.9-0.3 83.1c-0.3 92.4-0.6 87.8 6.3 90.7 4 1.6 42.3 1.1 45.6-0.7 5-2.6 4.9-1 4.9-88.2 0-55.5-0.3-82.4-1.1-84.5-2-5.8-3.6-6.2-27.3-6.2l-21.6-0-3.2 2.9zM1526.9 321l-3 2.9 0.3 65.3c0.4 73.1 0.1 69.9 8.1 85.3 16.7 31.7 69.6 39.8 100.3 15.4 4.1-3.3 8-6.8 8.6-7.9 2.1-3.3 2.9-2.3 2.7 3.3-0.2 5.7 0.7 8.1 4.1 11.2 2.1 1.9 3.4 2 23.4 1.7l21.1-0.3 3-3 3-2.9 0.3-81.3c0.2-55.7 0-82.4-0.8-84.9-2.1-7.4-3.5-7.8-27.7-7.8l-21.5-0-2.8 2.8c-3.7 3.7-4.4 15.3-3.7 61.2 0.6 43.7-0.6 50.6-10.3 61.3-15.8 17.3-42.1 14.7-49.6-4.9-1.7-4.5-1.9-9.1-2.1-57.9-0.3-58-0.2-56.6-4-60.1-2.6-2.4-2.7-2.4-24.5-2.4l-22-0-2.9 3z" />
    <g ref="eyesOpen" class="app-logo__eyes-open">
      <rect class="app-logo__eye" x="550" y="376" width="30" height="64" rx="15" />
      <rect class="app-logo__eye" x="614" y="376" width="30" height="64" rx="15" />
    </g>
    <g class="app-logo__eyes-happy">
      <path d="M549 418 Q565 386 581 418" />
      <path d="M613 418 Q629 386 645 418" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

defineProps<{
  // Лого стоит на тёмном фоне (например, в футере) — светлая версия
  onDark?: boolean
}>()

// Глаза робо-«a» ведут себя как у Ната: моргают через случайные промежутки, иногда дважды,
// а время от времени улыбаются
const BLINK_MIN_DELAY_MS = 1800
const BLINK_RANDOM_DELAY_MS = 3200
const DOUBLE_BLINK_CHANCE = 0.25
const DOUBLE_BLINK_GAP_MS = 260
const HAPPY_MIN_DELAY_MS = 7000
const HAPPY_RANDOM_DELAY_MS = 6000
const HAPPY_DURATION_MS = 1500

const root = useTemplateRef<SVGSVGElement>('root')
const eyesOpen = useTemplateRef<SVGGElement>('eyesOpen')

let blinkTimer: ReturnType<typeof setTimeout> | undefined
let doubleBlinkTimer: ReturnType<typeof setTimeout> | undefined
let happyTimer: ReturnType<typeof setTimeout> | undefined
let calmTimer: ReturnType<typeof setTimeout> | undefined

// Классы ставятся напрямую, чтобы CSS-анимация перезапускалась при каждом вызове
function restartClass(el: Element, className: string) {
  el.classList.remove(className)
  void el.getBoundingClientRect()
  el.classList.add(className)
}

function blink() {
  if (!eyesOpen.value) return
  restartClass(eyesOpen.value, 'app-logo__eyes-open--blink')
}

function scheduleBlink() {
  blinkTimer = setTimeout(() => {
    blink()
    if (Math.random() < DOUBLE_BLINK_CHANCE) {
      doubleBlinkTimer = setTimeout(blink, DOUBLE_BLINK_GAP_MS)
    }
    scheduleBlink()
  }, BLINK_MIN_DELAY_MS + Math.random() * BLINK_RANDOM_DELAY_MS)
}

function scheduleHappy() {
  happyTimer = setTimeout(() => {
    root.value?.classList.add('app-logo--happy')
    calmTimer = setTimeout(() => root.value?.classList.remove('app-logo--happy'), HAPPY_DURATION_MS)
    scheduleHappy()
  }, HAPPY_MIN_DELAY_MS + Math.random() * HAPPY_RANDOM_DELAY_MS)
}

onMounted(() => {
  // Смена глаз на улыбку — тоже резкое движение, поэтому при reduced motion лого стоит спокойно
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  scheduleBlink()
  scheduleHappy()
})

onBeforeUnmount(() => {
  clearTimeout(blinkTimer)
  clearTimeout(doubleBlinkTimer)
  clearTimeout(happyTimer)
  clearTimeout(calmTimer)
})
</script>

<style scoped lang="scss">
$happy-eye-width: 16;
// Светлое на тёмном кажется жирнее (иррадиация), хотя контуры те же.
// Светлую версию подрезаем по краям обводкой цвета фона на столько единиц viewBox
$on-dark-thinning: 6;

// Размер задаёт родитель через width, высота подстраивается по viewBox
.app-logo {
  --logo-nat: var(--color-text);
  --logo-askium: var(--color-blue);

  display: block;
  width: 100%;
  height: auto;
}

.app-logo--on-dark {
  // Должен совпадать с фоном под лого, иначе подрезка станет видимой обводкой
  --logo-bg: var(--color-night);
  --logo-nat: var(--color-white);
  --logo-askium: var(--color-blue-light);
}

.app-logo--on-dark .app-logo__nat,
.app-logo--on-dark .app-logo__askium,
.app-logo--on-dark .app-logo__eye {
  stroke: var(--logo-bg);
  stroke-width: $on-dark-thinning;
}

.app-logo__nat,
.app-logo__eye {
  fill: var(--logo-nat);
}

.app-logo__askium {
  fill: var(--logo-askium);
}

.app-logo__eye {
  transform-box: fill-box;
  transform-origin: center;
}

.app-logo__eyes-open--blink .app-logo__eye {
  animation: app-logo-blink 0.17s ease-in-out;
}

.app-logo__eyes-happy {
  fill: none;
  stroke: var(--logo-nat);
  stroke-width: $happy-eye-width;
  stroke-linecap: round;
  opacity: 0;
}

.app-logo--happy .app-logo__eyes-open {
  opacity: 0;
}

.app-logo--happy .app-logo__eyes-happy {
  opacity: 1;
}

@keyframes app-logo-blink {
  50% {
    transform: scaleY(0.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-logo__eyes-open--blink .app-logo__eye {
    animation: none;
  }
}
</style>
