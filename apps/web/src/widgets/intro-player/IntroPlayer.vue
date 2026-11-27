<template>
  <div
    ref="rootRef"
    class="intro-player"
    :class="{
      'intro-player--light': isLight,
      'intro-player--done': phase === 'done',
      'intro-player--timer': timerCount > 0,
    }"
  >
    <div v-if="!introTheme" class="intro-player__pcb" />
    <!-- Сцена темы кодом лежит там же, где статичная плата и ролик: позади скрима и содержимого -->
    <IntroTheme v-if="introTheme" ref="themeSceneRef" :theme-key="introTheme" :sound="themeSound" />
    <video
      v-if="src && !introTheme"
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
    <!-- Живой фон — на стартовом экране и в игре; во время заставки его нет -->
    <IntroThemeAmbience v-if="introTheme && phase !== 'playing'" :theme-key="introTheme" />

    <div v-if="$slots.toolbar" class="intro-player__toolbar">
      <slot name="toolbar" />
    </div>

    <!-- Иконки: Lucide, лицензия ISC, https://lucide.dev -->
    <div v-if="phase !== 'done'" class="intro-player__top">
      <button
        v-if="phase === 'playing' || skippable"
        type="button"
        class="intro-player__skip"
        :class="{ 'intro-player__skip--scrim': hasStartScrim }"
        @click="skip"
      >
        {{ skipLabel }}
        <svg class="intro-player__skip-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <polygon points="5 4 15 12 5 20 5 4" />
          <line x1="19" x2="19" y1="5" y2="19" />
        </svg>
      </button>
    </div>

    <div v-if="phase === 'start'" class="intro-player__start">
      <div class="intro-player__console" :class="{ 'intro-player__console--scrim': hasStartScrim }">
        <span class="intro-player__dots" aria-hidden="true">
          <i class="intro-player__dot intro-player__dot--green" />
          <i class="intro-player__dot intro-player__dot--orange" />
          <i class="intro-player__dot intro-player__dot--blue" />
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
        <button v-if="rules.length > 0" type="button" class="intro-player__rules-link" @click="rulesOpen = true">
          {{ rulesLabel }}
        </button>
      </div>
    </div>

    <!-- Таймер игры: на телефоне в левом верхнем углу, на широком экране — в колонке слева. Отдельной полосы нет -->
    <div v-show="phase === 'done' && intro" ref="timerRef" class="intro-player__timer" />

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
        <!-- Телефон: сплошная полоса сверху под таймером и кнопками, игра листается под ней -->
        <div class="intro-player__bar" />
        <div v-if="hasMore" class="intro-player__more">
          <button type="button" class="intro-player__more-button" :aria-label="scrollDownLabel" @click="scrollToEnd" />
        </div>
      </div>
    </Transition>

    <div class="intro-player__controls" :class="{ 'intro-player__controls--bar': phase === 'done' }">
      <button
        v-if="phase === 'done' && rules.length > 0"
        type="button"
        class="intro-player__control"
        :aria-label="rulesLabel"
        @click="rulesOpen = true"
      >
        <svg class="intro-player__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      </button>
      <button
        v-if="phase === 'playing' || (phase === 'done' && themeSound)"
        type="button"
        class="intro-player__control"
        :class="{ 'intro-player__control--scrim': hasStartScrim }"
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
        :class="{ 'intro-player__control--scrim': hasStartScrim }"
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

    <!-- Внутри корня: в полноэкранном режиме окно видно поверх игры. Пока оно открыто в игре, таймер на паузе -->
    <AppDialog v-if="rules.length > 0" v-model:open="rulesOpen" :title="rulesLabel">
      <ol class="intro-player__rules">
        <li v-for="(step, index) in rules" :key="index">{{ step }}</li>
      </ol>
      <p v-if="rulesNote" class="intro-player__rules-note">{{ rulesNote }}</p>
      <template #actions>
        <button class="intro-player__rules-close" type="button" autofocus @click="rulesOpen = false">{{ rulesCloseLabel }}</button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { AppDialog } from '@/shared'
import { PLAYER_ENTRANCE_KEY, PLAYER_PAUSE_KEY, PLAYER_SCROLL_KEY, PLAYER_SCROLL_RELEASE_KEY, PLAYER_SOUND_KEY, PLAYER_TIMER_SLOT_KEY } from '@/features/play-session'
import { IntroTheme, IntroThemeAmbience, createIntroEntrance, createIntroSound, createQuestionSwap, findTheme, type IntroSound, type QuestionSwap } from '@/entities/intro-theme'

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
    // Тема кодом (ADR 0015): интро рисует сцена темы, ролик не нужен. Тон темы перекрывает theme
    introTheme?: string | null
    typeLabel: string
    title: string
    hint: string
    startLabel: string
    skipLabel: string
    enterFullscreenLabel: string
    exitFullscreenLabel: string
    unmuteLabel: string
    muteLabel: string
    scrollDownLabel: string
    // «Как играть»: шаги правил игры; пусто — кнопки и окна нет
    rules?: string[]
    rulesNote?: string
    rulesLabel?: string
    rulesCloseLabel?: string
  }>(),
  {
    src: null,
    poster: undefined,
    intro: true,
    skippable: false,
    theme: 'night',
    introTheme: null,
    rules: () => [],
    rulesNote: '',
    rulesLabel: '',
    rulesCloseLabel: '',
  },
)

const emit = defineEmits<{ done: [] }>()

type Phase = 'start' | 'playing' | 'done'

const LONG_TITLE_LENGTH = 50
// Запас, после которого считается, что слот долистан до конца
const SCROLL_END_TOLERANCE_PX = 1

const videoRef = ref<HTMLVideoElement | null>(null)
const themeSceneRef = ref<InstanceType<typeof IntroTheme> | null>(null)
// Звуки темы кодом: включаются в обработчике «Начать» (жест пользователя), при пропуске и reduced motion молчат
const themeSound = shallowRef<IntroSound | null>(props.introTheme ? createIntroSound(props.introTheme) : null)
let soundUnlocked = false
const isLight = computed(() => (props.introTheme ? findTheme(props.introTheme).tone === 'light' : props.theme === 'light'))
// Без темы кадр за карточкой и «Пропустить» заранее не известен (ролик), поэтому подложка для контраста есть всегда
const hasStartScrim = computed(() => (props.introTheme ? findTheme(props.introTheme).startScrim : true))
const rootRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const timerRef = ref<HTMLElement | null>(null)
const phase = ref<Phase>(props.intro ? 'start' : 'done')
const canFullscreen = ref(false)
const isFullscreen = ref(false)
const isMuted = ref(false)
const hasMore = ref(false)
const timerCount = ref(0)
// Ролик играть нельзя (нет ролика, reduced-motion или ошибка загрузки): «Начать» ведёт сразу к содержимому
const isVideoUnavailable = ref(!props.src)
let resizeObserver: ResizeObserver | null = null

const scrollReleased = ref(false)

// Вылет только у первого вопроса после интро (при reduced motion — плавное проявление); рамка у темы кодом на всех вопросах
let entranceTaken = false
let unmounted = false
// Стиль можно сменить во время игры: смена вопроса перестраивается под новый тон, звук сохраняется внутри того же kind
let questionSwap: { key: string | null; swap: QuestionSwap | null } | null = null

function themeKind(key: string | null | undefined) {
  return key ? findTheme(key).kind : null
}

watch(
  () => props.introTheme,
  (next, prev) => {
    if (next === prev) return
    questionSwap?.swap?.cancel()
    questionSwap = null
    if (themeKind(next) === themeKind(prev)) return
    themeSound.value?.dispose()
    const created = next ? createIntroSound(next) : null
    if (created) {
      created.setMuted(isMuted.value)
      if (soundUnlocked) created.unlock()
    }
    themeSound.value = created
  },
)

provide(PLAYER_ENTRANCE_KEY, {
  get framed() {
    return !!props.introTheme && findTheme(props.introTheme).kind === 'code'
  },
  take: () => {
    if (entranceTaken || !props.introTheme || !rootRef.value) return null
    entranceTaken = true
    return createIntroEntrance(props.introTheme, rootRef.value, isReducedMotion(), themeSound.value)
  },
  swap: () => {
    if (questionSwap?.key !== props.introTheme) {
      questionSwap?.swap?.cancel()
      questionSwap = { key: props.introTheme, swap: createQuestionSwap(props.introTheme, isReducedMotion(), themeSound.value) }
    }
    return questionSwap.swap
  },
})

const rulesOpen = ref(false)
provide(PLAYER_PAUSE_KEY, computed(() => rulesOpen.value && phase.value === 'done'))
provide(PLAYER_SOUND_KEY, (name) => themeSound.value?.play(name))

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

function isReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

// Раскладка интро считается один раз: два кадра, чтобы размер после смены экрана устоялся
async function playThemeIntro() {
  phase.value = 'playing'
  await nextFrame()
  await nextFrame()
  if (unmounted || phase.value !== 'playing') return
  await themeSceneRef.value?.play()
  if (unmounted) return
  finish()
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
  if (props.introTheme) {
    if (!isReducedMotion()) {
      soundUnlocked = true
      themeSound.value?.unlock()
      void playThemeIntro()
      return
    }
    finish()
    return
  }
  // Полный экран — только по кнопке «На весь экран», «Начать» его не включает (решение пользователя 2026-11-21)
  const video = videoRef.value
  if (!video || isVideoUnavailable.value) {
    finish()
    return
  }
  phase.value = 'playing'
  void playWithSoundOrMuted(video)
}

function skip() {
  if (props.introTheme) {
    // «Пропустить» на стартовом экране — тоже жест: звуки игры включаются, звук интро обрывается
    if (!isReducedMotion()) {
      soundUnlocked = true
      themeSound.value?.unlock()
    }
    themeSound.value?.stop()
    themeSceneRef.value?.skip()
    finish()
    return
  }
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
  if (themeSound.value) {
    isMuted.value = !isMuted.value
    themeSound.value.setMuted(isMuted.value)
    return
  }
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
  unmounted = true
  questionSwap?.swap?.cancel()
  themeSound.value?.dispose()
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
// Поля окна слева и справа на десктопе
$window-side-desktop: 40px;
$rail-gap: 12px;
// Отступ от углов окна и размер угловых кнопок
$game-corner-gap: 12px;
$game-corner-size: 56px;
// Кнопки звука и экрана: отступы от углов и место под ними в слоте игры
$controls-edge: 20px;
$controls-bottom: 28px;
$controls-clearance: $controls-bottom + $game-corner-size + $game-corner-gap;
// Телефон в игре: кнопки в верхней полосе, снизу место только под стрелку «листайте ниже»
$slot-bottom-phone: 36px;
// Кнопки в полосе на телефоне: меньше угловых, по центру полосы высотой с таймер
$control-size-bar: 44px;
$control-gap-bar: 10px;
$control-icon-bar: 22px;
// Высота полосы на телефоне: кнопка и по 8px сверху и снизу. Таймер на телефоне — только цифры, помещается
$bar-pad: 8px;
$bar-height: $control-size-bar + $bar-pad * 2;
// Кнопки в углу на планшете и шире: «Как играть», звук, полный экран
$controls-gap: 14px;
$control-size-wide: 48px;
$controls-count: 3;
$controls-width-wide: $controls-count * $control-size-wide + ($controls-count - 1) * $controls-gap;
// Центр кнопок вровень с кнопкой нижней полосы игры («Проверить»: 14px отступ + 56px кнопка): 18 + 48 / 2 = 14 + 56 / 2
$controls-bottom-wide: 18px;

@mixin pressable($shadow-size, $pressed-size) {
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;

  &:active {
    transform: translateY(#{$shadow-size - $pressed-size}) ;
  }

  &:focus-visible {
    outline: 4px solid var(--g-focus);
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
  --g-card-scrim: rgb(23 27 58 / 0.85);

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
    width: min(100% - #{$window-side-desktop * 2}, calc((100dvh - var(--header-height) - #{$window-margin}) * 16 / 9));
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
  --g-card-scrim: rgb(255 255 255 / 0.9);
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
  justify-content: flex-end;
  gap: 16px;
  min-height: 52px;
  padding: 16px 20px 0;

  @include tablet {
    min-height: 60px;
    padding-right: 130px;
  }
}

// Второстепенная кнопка: контур без заливки, чтобы не спорить с «Начать». Подсветка наведения — слой поверх заливки
.intro-player__skip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 18px;
  white-space: nowrap;
  border: 2px solid var(--g-text);
  border-radius: 999px;
  background-color: transparent;
  color: var(--g-text);
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: box-shadow 0.15s ease;

  // Подсветка — внутренняя тень во всю кнопку: ложится поверх подложки и плавно появляется
  @media (hover: hover) {
    &:hover {
      box-shadow: inset 0 0 0 100vmax var(--g-surface);
    }
  }

  &:active {
    box-shadow: inset 0 0 0 100vmax var(--g-surface-hover);
  }

  &:focus-visible {
    outline: 3px solid var(--g-focus);
    outline-offset: 3px;
  }

  &--scrim {
    background-color: var(--g-card-scrim);
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

// Тот же вид, что у карточки задания после вылета (EntranceCard): синяя рамка, скругление, точки окна
.intro-player__console {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  margin: auto 0;
  padding: 16px 16px 20px;
  border: 3px solid var(--color-blue);
  border-radius: 24px;

  @include tablet {
    max-width: 560px;
    margin: auto;
    padding: 20px 24px 24px;
    border-radius: 32px;
  }

  &--scrim {
    background: var(--g-card-scrim);
  }
}

.intro-player__dots {
  display: flex;
  gap: 8px;
}

.intro-player__dot {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 50%;

  &--green {
    background: var(--color-green);
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
  min-height: 36px;
  margin: 16px 0 0;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--color-orange);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.intro-player__title {
  margin: 14px 0 0;
  color: var(--g-text);
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
  margin: 10px 0 24px;
  color: var(--g-muted);
  font-family: var(--font-body);
  font-size: 18px;
  line-height: 1.4;

  @include tablet {
    margin-bottom: 20px;
    font-size: 17px;
  }
}

.intro-player__start-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  min-height: 76px;
  padding: 0 16px;
  border: 0;
  border-radius: 20px;
  background: var(--color-green-light);
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  text-transform: uppercase;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 0.15s ease,
    background-color 0.15s ease;

  @media (hover: hover) {
    &:hover {
      background: var(--color-green);
    }
  }

  &:active {
    background: var(--color-green);
    transform: scale(0.98);
  }

  &:focus-visible {
    outline: 4px solid var(--g-focus);
    outline-offset: 3px;
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

// Звук и полный экран — всегда в правом нижнем углу, плоские контурные, как «Пропустить».
// Слот игры оставляет под ними место снизу, чтобы они не закрывали ответы
.intro-player__controls {
  position: absolute;
  right: $controls-edge;
  bottom: $controls-bottom;
  z-index: var(--z-player-controls);
  display: flex;
  gap: $controls-gap;

  @include tablet {
    bottom: $controls-bottom-wide;
  }

  &--bar {
    top: $bar-pad;
    right: $game-corner-gap;
    bottom: auto;
    gap: $control-gap-bar;

    .intro-player__control {
      width: $control-size-bar;
      height: $control-size-bar;
    }

    .intro-player__icon {
      width: $control-icon-bar;
      height: $control-icon-bar;
    }

    @include tablet {
      top: auto;
      right: $controls-edge;
      bottom: $controls-bottom-wide;
      gap: $controls-gap;

      .intro-player__control {
        width: $control-size-wide;
        height: $control-size-wide;
      }

      .intro-player__icon {
        width: 26px;
        height: 26px;
      }
    }
  }
}

.intro-player__bar {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: var(--z-player-bar);
  height: $bar-height;
  border-bottom: 1px solid var(--g-line);
  background: var(--g-sticky);

  @include tablet {
    display: none;
  }
}

.intro-player__control {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 2px solid var(--g-text);
  border-radius: 50%;
  background-color: transparent;
  color: var(--g-text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: box-shadow 0.15s ease;

  @media (hover: hover) {
    &:hover {
      box-shadow: inset 0 0 0 100vmax var(--g-surface);
    }
  }

  &:active {
    box-shadow: inset 0 0 0 100vmax var(--g-surface-hover);
  }

  &:focus-visible {
    outline: 3px solid var(--g-focus);
    outline-offset: 3px;
  }

  &--scrim {
    background-color: var(--g-card-scrim);
  }

  @include tablet {
    width: $control-size-wide;
    height: $control-size-wide;
  }
}

// Телефон: таймер в левом верхнем углу, напротив кнопок. Широкий экран: в колонке слева
.intro-player__timer {
  position: absolute;
  top: 0;
  left: $game-corner-gap;
  z-index: var(--z-player-rail);
  display: flex;
  align-items: center;
  min-height: $bar-height;
  pointer-events: none;

  @include tablet {
    top: $game-corner-gap * 2;
    left: $rail-gap;
    width: calc(var(--player-rail-width) - #{$rail-gap});
    min-height: 0;
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
// Телефон: сверху место под полосу с таймером и кнопками, снизу — под стрелку «листайте ниже».
// --player-controls-clearance — для нижних полос игр.
// Закреплённое в игре (лоток слов) отсчитывает top от верхнего отступа слота, то есть уже от низа полосы
.intro-player__content {
  --play-sticky-top: 0px;
  --player-pad-start: calc(8px + var(--player-rail-width));
  --player-pad-end: 8px;
  --player-controls-clearance: #{$slot-bottom-phone};

  flex: 1;
  min-height: 0;
  padding: $bar-height var(--player-pad-end) var(--player-controls-clearance) var(--player-pad-start);
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
    --player-controls-clearance: #{$controls-clearance};
    // Сколько места справа занимают кнопки в углу (с зазором): нижние полосы игр не заходят под них
    --player-controls-room: #{$controls-edge + $controls-width-wide + $controls-gap};

    padding-top: $game-corner-gap;
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
  .intro-player__start-button {
    transition: none;
  }

  .intro-player__start-button:active {
    transform: none;
  }
}

// «Как играть» на стартовом экране — тихая ссылка под «Начать»
.intro-player__rules-link {
  align-self: center;
  min-height: 44px;
  margin-top: 4px;
  padding: 8px 16px;
  border: 0;
  background: none;
  color: var(--g-text);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid var(--g-focus);
    outline-offset: 2px;
    border-radius: 12px;
  }
}

.intro-player__rules {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding-left: 22px;
  font-size: 16px;
  line-height: 1.45;
}

.intro-player__rules-note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.4;
}

.intro-player__rules-close {
  min-height: 48px;
  padding: 8px 16px;
  border: 0;
  border-radius: 999px;
  background: var(--color-blue);
  color: var(--color-white);
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid var(--color-blue-dark);
    outline-offset: 2px;
  }
}
</style>
