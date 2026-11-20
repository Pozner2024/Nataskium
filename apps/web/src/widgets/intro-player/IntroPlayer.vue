<template>
  <div
    ref="rootRef"
    class="intro-player"
    :class="{
      'intro-player--light': theme === 'light',
      'intro-player--done': phase === 'done',
      'intro-player--timer': timerCount > 0,
    }"
  >
    <div class="intro-player__pcb" />
    <video
      v-if="src"
      ref="videoRef"
      class="intro-player__video"
      :class="{ 'intro-player__video--hidden': phase === 'start' }"
      :src="src"
      :poster="poster"
      playsinline
      preload="auto"
      aria-hidden="true"
      @ended="finish"
      @error="onVideoError"
      @volumechange="syncMuted"
    />
    <div v-if="phase === 'done'" class="intro-player__scrim" />

    <div v-if="$slots.toolbar" class="intro-player__toolbar">
      <slot name="toolbar" />
    </div>

    <!-- Иконки: Lucide, лицензия ISC, https://lucide.dev -->
    <div v-if="phase !== 'done'" class="intro-player__top">
      <div class="intro-player__steps" aria-hidden="true">
        <i v-for="step in STEPS" :key="step" class="intro-player__step" :class="{ 'intro-player__step--on': step <= currentStep }" />
      </div>
      <button v-if="phase === 'playing' || skippable" type="button" class="intro-player__skip" @click="skip">
        {{ skipLabel }}
        <svg class="intro-player__skip-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <polygon points="5 4 15 12 5 20 5 4" />
          <line x1="19" x2="19" y1="5" y2="19" />
        </svg>
      </button>
    </div>

    <div v-if="phase === 'start'" class="intro-player__start">
      <div class="intro-player__console">
        <span class="intro-player__leds" aria-hidden="true">
          <i class="intro-player__led intro-player__led--green" />
          <i class="intro-player__led intro-player__led--orange" />
          <i class="intro-player__led intro-player__led--blue" />
        </span>
        <p class="intro-player__type">{{ typeLabel }}</p>
        <h1 class="intro-player__title" :class="{ 'intro-player__title--long': title.length > LONG_TITLE_LENGTH }">{{ title }}</h1>
        <p class="intro-player__hint">{{ hint }}</p>
        <button type="button" class="intro-player__start-button" @click="start">
          <svg class="intro-player__start-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
          {{ startLabel }}
        </button>
      </div>
    </div>

    <div v-show="phase === 'done' && intro" class="intro-player__bar">
      <div class="intro-player__steps intro-player__steps--compact" aria-hidden="true">
        <i v-for="step in STEPS" :key="step" class="intro-player__step intro-player__step--on" />
      </div>
      <div ref="timerRef" class="intro-player__timer" />
      <button
        v-if="canFullscreen"
        type="button"
        class="intro-player__screen"
        :aria-pressed="isFullscreen"
        @click="toggleFullscreen"
      >
        <svg class="intro-player__icon intro-player__icon--small" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <template v-if="isFullscreen">
            <path d="M8 3v3a2 2 0 0 1-2 2H3" />
            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
            <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
          </template>
          <template v-else>
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </template>
        </svg>
        {{ isFullscreen ? collapseLabel : enterFullscreenLabel }}
      </button>
    </div>

    <Transition name="intro-player-fade">
      <div v-if="phase === 'done'" class="intro-player__body">
        <!-- Слот листается сам: фон и полосы стоят на месте -->
        <div
          ref="scrollRef"
          class="intro-player__content"
          :class="{ 'intro-player__content--released': scrollReleased }"
          tabindex="0"
          @scroll="measureSlot"
        >
          <slot />
        </div>
        <div v-if="hasMore" class="intro-player__more">
          <button type="button" class="intro-player__more-button" :aria-label="scrollDownLabel" @click="scrollToEnd" />
        </div>
      </div>
    </Transition>

    <div v-if="phase !== 'done'" class="intro-player__controls">
      <button
        v-if="phase === 'playing'"
        type="button"
        class="intro-player__control"
        :aria-label="isMuted ? unmuteLabel : muteLabel"
        @click="toggleMuted"
      >
        <svg class="intro-player__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"
          />
          <template v-if="isMuted">
            <line x1="22" x2="16" y1="9" y2="15" />
            <line x1="16" x2="22" y1="9" y2="15" />
          </template>
          <template v-else>
            <path d="M16 9a5 5 0 0 1 0 6" />
            <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
          </template>
        </svg>
      </button>
      <button
        v-if="canFullscreen"
        type="button"
        class="intro-player__control"
        :aria-label="isFullscreen ? exitFullscreenLabel : enterFullscreenLabel"
        @click="toggleFullscreen"
      >
        <svg class="intro-player__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <template v-if="isFullscreen">
            <path d="M8 3v3a2 2 0 0 1-2 2H3" />
            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
            <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
          </template>
          <template v-else>
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </template>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { PLAYER_SCROLL_KEY, PLAYER_SCROLL_RELEASE_KEY, PLAYER_TIMER_SLOT_KEY } from '@/features/play-session'

const props = withDefaults(
  defineProps<{
    // Ролика нет — «Начать» ведёт сразу к содержимому
    src?: string | null
    poster?: string
    // false — без интро и без полосы: содержимое сразу (ошибки загрузки, «не найдено»)
    intro?: boolean
    // «Пропустить» уже на стартовом экране (предпросмотр учителя)
    skippable?: boolean
    theme?: 'night' | 'light'
    typeLabel: string
    title: string
    hint: string
    startLabel: string
    skipLabel: string
    enterFullscreenLabel: string
    exitFullscreenLabel: string
    collapseLabel: string
    unmuteLabel: string
    muteLabel: string
    scrollDownLabel: string
  }>(),
  { src: null, poster: undefined, intro: true, skippable: false, theme: 'night' },
)

const emit = defineEmits<{ done: [] }>()

type Phase = 'start' | 'playing' | 'done'

const STEPS = [1, 2, 3]
const STEP_BY_PHASE: Record<Phase, number> = { start: 1, playing: 2, done: 3 }
const LONG_TITLE_LENGTH = 50
// Запас, после которого считается, что слот долистан до конца
const SCROLL_END_TOLERANCE_PX = 1

const videoRef = ref<HTMLVideoElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const timerRef = ref<HTMLElement | null>(null)
const phase = ref<Phase>(props.intro ? 'start' : 'done')
const currentStep = computed(() => STEP_BY_PHASE[phase.value])
const canFullscreen = ref(false)
const isFullscreen = ref(false)
const isMuted = ref(false)
const hasMore = ref(false)
const timerCount = ref(0)
// Ролик играть нельзя (нет ролика, reduced-motion или ошибка загрузки): «Начать» ведёт сразу к содержимому
const isVideoUnavailable = ref(!props.src)
let resizeObserver: ResizeObserver | null = null

const scrollReleased = ref(false)

provide(PLAYER_SCROLL_KEY, scrollRef)
provide(PLAYER_SCROLL_RELEASE_KEY, scrollReleased)
provide(PLAYER_TIMER_SLOT_KEY, {
  target: computed(() => (props.intro ? timerRef.value : null)),
  attach: () => {
    timerCount.value += 1
    return () => {
      timerCount.value -= 1
    }
  },
})

function finish() {
  if (phase.value === 'done') return
  phase.value = 'done'
  emit('done')
}

function onVideoError() {
  isVideoUnavailable.value = true
  if (phase.value === 'playing') finish()
}

async function requestFullscreenQuietly() {
  try {
    await rootRef.value?.requestFullscreen()
  } catch {
    // Браузер вправе отказать: остаёмся как есть
  }
}

async function playWithSoundOrMuted(video: HTMLVideoElement) {
  video.muted = false
  try {
    await video.play()
    return
  } catch {
    video.muted = true
  }
  try {
    await video.play()
  } catch {
    finish()
  }
}

function start() {
  if (canFullscreen.value) void requestFullscreenQuietly()
  const video = videoRef.value
  if (!video || isVideoUnavailable.value) {
    finish()
    return
  }
  phase.value = 'playing'
  void playWithSoundOrMuted(video)
}

function skip() {
  const video = videoRef.value
  video?.pause()
  // Последний кадр остаётся фоном под содержимым
  if (video && Number.isFinite(video.duration)) video.currentTime = video.duration
  finish()
}

function syncMuted() {
  if (videoRef.value) isMuted.value = videoRef.value.muted
}

function toggleMuted() {
  if (videoRef.value) videoRef.value.muted = !videoRef.value.muted
}

function syncFullscreen() {
  isFullscreen.value = document.fullscreenElement === rootRef.value
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await requestFullscreenQuietly()
    return
  }
  try {
    await document.exitFullscreen()
  } catch {
    // Выход мог уже произойти по Esc
  }
}

// Высота слота нужна игре для колонки, которая листается сама (слова сопоставления на широком экране)
function measureSlot() {
  const element = scrollRef.value
  hasMore.value = element !== null && element.scrollTop + element.clientHeight < element.scrollHeight - SCROLL_END_TOLERANCE_PX
  element?.style.setProperty('--player-slot-height', `${element.clientHeight}px`)
}

// Кнопка исчезает в конце прокрутки: фокус переходит на слот, а не теряется
function scrollToEnd() {
  const element = scrollRef.value
  if (!element) return
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  element.focus({ preventScroll: true })
  element.scrollTo({ top: element.scrollHeight, behavior: isReducedMotion ? 'auto' : 'smooth' })
}

// Высота содержимого меняется без прокрутки (новый вопрос, итог): тень «ниже ещё есть» пересчитывается
function observeContent(element: HTMLElement | null) {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!element || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(measureSlot)
  resizeObserver.observe(element)
  for (const child of element.children) resizeObserver.observe(child)
  measureSlot()
}

watch(scrollRef, async (element) => {
  await nextTick()
  observeContent(element)
})

onMounted(() => {
  canFullscreen.value = document.fullscreenEnabled
  document.addEventListener('fullscreenchange', syncFullscreen)
  // Ошибка могла случиться до гидрации, пока слушателей ещё не было
  if (videoRef.value?.error || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    isVideoUnavailable.value = true
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  resizeObserver?.disconnect()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;
@use '@/assets/styles/breakpoints.module' as *;

$edge: rgb(0 0 0 / 0.5);
// Поля страницы над и под окном проигрывателя на планшете и десктопе
$window-margin: 48px;
$rail-gap: 12px;

@mixin pressable($shadow-size, $pressed-size) {
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;

  &:active {
    transform: translateY(#{$shadow-size - $pressed-size}) ;
  }

  &:focus-visible {
    outline: 4px solid var(--color-white);
    outline-offset: 3px;
  }
}

// transform, filter, contain и backdrop-filter на корне и слоте запрещены: с ними position: fixed
// летящей плитки считается не от окна. Всё, что поверх игры, живёт внутри корня (иначе не видно в полном экране)
.intro-player {
  // Тема по умолчанию — ночной кадр. Под другой кадр ролика меняется только набор переменных
  --g-text: #ffffff;
  --g-muted: rgb(255 255 255 / 0.88);
  --g-surface: rgb(255 255 255 / 0.12);
  --g-surface-hover: rgb(255 255 255 / 0.2);
  --g-chip: rgb(255 255 255 / 0.16);
  --g-line: rgb(255 255 255 / 0.5);
  --g-divider: rgb(255 255 255 / 0.2);
  --g-sticky: #171b3a;
  --g-accent: #93b0f9;
  --g-accent-soft: rgb(147 176 249 / 0.28);
  --g-ok: #7cc858;
  --g-ok-soft: rgb(124 200 88 / 0.22);
  --g-on-ok: #171b3a;
  --g-bad: #ff9b9b;
  --g-bad-soft: rgb(255 155 155 / 0.2);
  --g-on-bad: #171b3a;
  --g-action: #e98d34;
  --g-action-edge: #c67127;
  --g-action-text: #1a2140;
  --g-hand: #2549c5;
  --g-timer-track: rgb(255 255 255 / 0.12);
  --g-timer-fill: #ffffff;
  --g-timer-text: #ffffff;
  --g-timer-tick: #171b3a;
  --g-timer-low: #e98d34;
  --g-focus: #ffffff;
  --g-scrim-top: rgb(23 27 58 / 0.65);
  --g-scrim-bottom: rgb(23 27 58 / 0.85);
  --g-more: rgb(23 27 58 / 0.75);

  --player-rail-width: 0px;

  position: relative;
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--header-height));
  min-height: 420px;
  overflow: hidden;
  isolation: isolate;
  background: var(--color-night);
  color: var(--color-white);
  --focus-color: var(--g-focus);

  @include tablet {
    width: min(100% - 32px, calc((100dvh - var(--header-height) - #{$window-margin}) * 4 / 3));
    height: auto;
    min-height: 0;
    margin: 16px auto;
    aspect-ratio: 4 / 3;
    border-radius: 20px;
    box-shadow: 0 10px 30px rgb(var(--rgb-night) / 0.28);
  }

  @include desktop {
    width: min(100% - 160px, calc((100dvh - var(--header-height) - #{$window-margin}) * 16 / 9));
    margin: 24px auto;
    aspect-ratio: 16 / 9;
  }

  &:fullscreen {
    width: 100%;
    height: 100%;
    margin: 0;
    aspect-ratio: auto;
    border-radius: 0;
  }
}

.intro-player--light {
  --g-text: #1a2140;
  --g-muted: #3b4263;
  --g-surface: rgb(255 255 255 / 0.62);
  --g-surface-hover: rgb(255 255 255 / 0.82);
  --g-chip: rgb(255 255 255 / 0.78);
  --g-line: rgb(26 33 64 / 0.55);
  --g-divider: rgb(26 33 64 / 0.22);
  --g-sticky: rgb(255 255 255 / 0.96);
  --g-accent: #2549c5;
  --g-accent-soft: rgb(37 73 197 / 0.16);
  --g-ok: #2f7a14;
  --g-ok-soft: rgb(70 135 43 / 0.2);
  --g-on-ok: #ffffff;
  --g-bad: #c73a3a;
  --g-bad-soft: rgb(199 58 58 / 0.16);
  --g-on-bad: #ffffff;
  --g-focus: #1a2140;
  --g-timer-track: rgb(69 115 244 / 0.12);
  --g-timer-fill: #4573f4;
  --g-timer-text: #2549c5;
  --g-timer-tick: #2549c5;
  --g-timer-low: #a35a1a;
  --g-scrim-top: rgb(255 255 255 / 0.45);
  --g-scrim-bottom: rgb(255 255 255 / 0.72);
  --g-more: rgb(255 255 255 / 0.8);
}

// Колонка с таймером на широком экране лежит поверх левого поля слота
.intro-player--timer {
  @include tablet {
    --player-rail-width: 84px;
  }

  @include desktop {
    --player-rail-width: 128px;
  }

  &:fullscreen {
    @include desktop {
      --player-rail-width: 144px;
    }
  }
}

.intro-player__pcb {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: url($board-white) 0 0 / #{$board-tile-size} auto repeat;
  -webkit-mask-image:
    radial-gradient(ellipse 85% 38% at 100% 0%, #000 0%, transparent 100%),
    radial-gradient(ellipse 90% 34% at 0% 100%, #000 0%, transparent 100%);
  mask-image:
    radial-gradient(ellipse 85% 38% at 100% 0%, #000 0%, transparent 100%),
    radial-gradient(ellipse 90% 34% at 0% 100%, #000 0%, transparent 100%);
}

.intro-player__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;

  &--hidden {
    visibility: hidden;
  }
}

.intro-player__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(var(--g-scrim-top), var(--g-scrim-bottom));
}

.intro-player__toolbar {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  min-height: 48px;
  background: var(--color-blue-dark);
  color: var(--color-white);
}

.intro-player__top {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  gap: 16px;
  min-height: 52px;
  padding: 16px 20px 0;

  @include tablet {
    min-height: 60px;
    padding-right: 130px;
  }
}

.intro-player__steps {
  display: flex;
  flex: 1;
  gap: 6px;

  &--compact {
    flex: none;
    width: 64px;

    @include tablet {
      width: 132px;
    }
  }
}

.intro-player__step {
  display: block;
  flex: 1;
  height: 10px;
  border-radius: 5px;
  background: rgb(var(--rgb-white) / 0.4);

  &--on {
    background: var(--color-green-light);
    box-shadow: 0 0 8px rgb(124 200 88 / 0.7);
  }

  .intro-player__steps--compact & {
    height: 6px;
    border-radius: 3px;
    box-shadow: none;
  }
}

.intro-player__skip {
  @include pressable(5px, 1px);

  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 20px;
  white-space: nowrap;
  border: 0;
  border-radius: 18px;
  background: var(--color-orange);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 17px;
  font-weight: 700;
  box-shadow:
    0 5px 0 var(--color-orange-dark),
    inset 0 2px 0 rgb(var(--rgb-white) / 0.35);
  cursor: pointer;

  &:active {
    box-shadow:
      0 1px 0 var(--color-orange-dark),
      inset 0 2px 0 rgb(var(--rgb-white) / 0.35);
  }
}

.intro-player__start {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  min-height: 0;
  padding: 16px 16px 96px;
  overflow-y: auto;

  @include tablet {
    padding: 8px 24px 20px;
  }
}

.intro-player__console {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  margin: auto 0;
  padding: 40px 22px 28px;
  border: 3px solid var(--color-blue-dark);
  border-radius: 32px;
  background: rgb(23 27 58 / 0.82);
  box-shadow:
    0 8px 0 $edge,
    0 0 40px rgb(var(--rgb-blue) / 0.25);

  @include tablet {
    max-width: 560px;
    margin: auto;
    padding: 34px 24px 20px;
  }
}

.intro-player__leds {
  position: absolute;
  top: 14px;
  left: 24px;
  display: flex;
  gap: 6px;
}

.intro-player__led {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;

  &--green {
    background: var(--color-green-light);
  }

  &--orange {
    background: var(--color-orange);
  }

  &--blue {
    background: var(--color-blue);
  }
}

.intro-player__type {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  margin: 0;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--color-orange);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  box-shadow: 0 3px 0 var(--color-orange-dark);
}

.intro-player__title {
  margin: 18px 0 0;
  color: var(--color-white);
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.22;
  overflow-wrap: anywhere;

  &--long {
    font-size: 20px;
  }

  @include tablet {
    margin-top: 12px;
    font-size: 22px;
  }
}

.intro-player__hint {
  width: 100%;
  margin: 14px 0 26px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgb(0 0 0 / 0.3);
  color: var(--color-white);
  font-family: var(--font-body);
  font-size: 18px;
  line-height: 1.4;

  @include tablet {
    margin: 10px 0 18px;
    padding: 10px 14px;
    font-size: 17px;
  }
}

.intro-player__start-button {
  @include pressable(7px, 2px);

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  min-height: 76px;
  padding: 0 16px;
  border: 0;
  border-radius: 24px;
  background: linear-gradient(var(--color-green-light), var(--color-green));
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  text-transform: uppercase;
  box-shadow:
    0 7px 0 var(--color-green-dark),
    inset 0 3px 0 rgb(var(--rgb-white) / 0.35);
  cursor: pointer;

  &:active {
    box-shadow:
      0 2px 0 var(--color-green-dark),
      inset 0 3px 0 rgb(var(--rgb-white) / 0.2);
  }

  @include tablet {
    min-height: 64px;
  }
}

.intro-player__start-icon,
.intro-player__skip-icon,
.intro-player__icon {
  display: block;
  flex: none;
  fill: none;
  stroke: currentcolor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.intro-player__start-icon {
  width: 30px;
  height: 30px;
  fill: currentcolor;
}

.intro-player__skip-icon {
  width: 22px;
  height: 22px;
  fill: currentcolor;
}

.intro-player__icon {
  width: 26px;
  height: 26px;

  &--small {
    width: 24px;
    height: 24px;
  }
}

.intro-player__controls {
  position: absolute;
  right: 20px;
  bottom: 28px;
  z-index: var(--z-player-controls);
  display: flex;
  gap: 14px;

  @include tablet {
    top: 6px;
    right: 12px;
    bottom: auto;
  }
}

.intro-player__control {
  @include pressable(5px, 1px);

  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 3px solid var(--color-blue-light);
  border-radius: 50%;
  background: var(--color-night);
  color: var(--color-white);
  box-shadow: 0 5px 0 $edge;
  cursor: pointer;

  &:active {
    background: var(--color-blue-dark);
    box-shadow: 0 1px 0 $edge;
  }

  @include tablet {
    width: 48px;
    height: 48px;
  }
}

// Полоса игры всегда тёмная, поэтому таймер в ней «ночной» в любой теме
.intro-player__bar {
  --g-timer-track: rgb(255 255 255 / 0.12);
  --g-timer-fill: #ffffff;
  --g-timer-text: #ffffff;
  --g-timer-tick: #171b3a;
  --g-timer-low: #e98d34;

  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 4px 10px 4px 20px;
  background: rgb(var(--rgb-night) / 0.85);
  box-shadow: 0 1px 0 rgb(147 176 249 / 0.25);

  @include tablet {
    gap: 14px;
    min-height: 48px;
    padding: 2px 12px 2px 20px;
  }
}

// Телефон: таймер по центру полосы. Широкий экран: в колонке слева под полосой, поверх поля слота
.intro-player__timer {
  display: flex;
  flex: 1;
  justify-content: center;
  min-width: 0;

  @include tablet {
    position: absolute;
    top: calc(100% + 20px);
    left: $rail-gap;
    z-index: var(--z-player-rail);
    width: calc(var(--player-rail-width) - #{$rail-gap});
    pointer-events: none;
  }

  .intro-player:fullscreen & {
    @include desktop {
      top: calc(100% + 28px);
    }
  }
}

.intro-player__screen {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  margin-left: auto;
  padding: 0 16px 0 12px;
  border: 2px solid var(--color-blue-light);
  border-radius: 999px;
  background: var(--color-night);
  color: var(--color-white);
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 700;
  box-shadow: 0 4px 0 $edge;
  cursor: pointer;
  transition: background-color 0.15s ease;

  @media (hover: hover) {
    &:hover {
      background: #222852;
    }
  }

  &:active {
    background: var(--color-blue-dark);
    box-shadow: 0 1px 0 $edge;
  }

  &:focus-visible {
    outline: 3px solid var(--color-white);
    outline-offset: 2px;
  }
}

.intro-player__body {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

// Отступы слота доступны игре: нижняя полоса «Проверить» растягивается на всю ширину окна
.intro-player__content {
  --play-sticky-top: 0px;
  --player-pad-start: calc(8px + var(--player-rail-width));
  --player-pad-end: 8px;

  flex: 1;
  min-height: 0;
  padding: 10px var(--player-pad-end) 0 var(--player-pad-start);
  overflow-y: auto;
  // Во время игры свайп по слоту не уводит страницу; после итога прокрутка доходит до подвала
  overscroll-behavior-y: contain;
  color: var(--g-text);
  scrollbar-color: rgb(var(--rgb-white) / 0.6) rgb(var(--rgb-white) / 0.08);
  scrollbar-width: thin;

  &:focus-visible {
    outline: 3px solid var(--g-focus);
    outline-offset: -3px;
  }

  @include tablet {
    // Без колонки таймера поля слева и справа одинаковые
    --player-pad-start: max(16px, calc(#{$rail-gap} + var(--player-rail-width)));
    --player-pad-end: 16px;

    padding-top: 0;
  }
}

.intro-player__content--released {
  overscroll-behavior-y: auto;
}

.intro-player__more {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--z-player-more);
  height: 36px;
  background: linear-gradient(rgb(255 255 255 / 0), var(--g-more));
  pointer-events: none;
}

.intro-player__more-button {
  position: absolute;
  bottom: 0;
  left: calc(50% - 22px);
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  pointer-events: auto;

  &::after {
    content: '';
    position: absolute;
    bottom: 14px;
    left: calc(50% - 5px);
    width: 10px;
    height: 10px;
    border-right: 3px solid var(--g-text);
    border-bottom: 3px solid var(--g-text);
    rotate: 45deg;
  }

  &:focus-visible {
    outline: 3px solid var(--g-focus);
    outline-offset: -3px;
  }
}

.intro-player-fade-enter-active {
  transition: opacity 0.3s ease;
}

.intro-player-fade-enter-from {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .intro-player-fade-enter-active,
  .intro-player__skip,
  .intro-player__control,
  .intro-player__start-button,
  .intro-player__screen {
    transition: none;
  }
}
</style>
