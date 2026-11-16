<template>
  <div ref="rootRef" class="intro-player">
    <div class="intro-player__pcb" />
    <video
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
    <div v-if="phase === 'start'" class="intro-player__start">
      <div class="intro-player__console">
        <span class="intro-player__leds" aria-hidden="true">
          <i class="intro-player__led intro-player__led--green" />
          <i class="intro-player__led intro-player__led--orange" />
          <i class="intro-player__led intro-player__led--blue" />
        </span>
        <p class="intro-player__type">{{ typeLabel }}</p>
        <h1 class="intro-player__title">{{ title }}</h1>
        <p class="intro-player__hint">{{ hint }}</p>
        <button type="button" class="intro-player__start-button" @click="start">
          <svg class="intro-player__start-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
          {{ startLabel }}
        </button>
      </div>
    </div>
    <Transition name="intro-player-fade">
      <div v-if="phase === 'done'" class="intro-player__content">
        <slot />
      </div>
    </Transition>
    <!-- Иконки: Lucide, лицензия ISC, https://lucide.dev -->
    <div class="intro-player__top">
      <div class="intro-player__steps" aria-hidden="true">
        <i v-for="step in STEPS" :key="step" class="intro-player__step" :class="{ 'intro-player__step--on': step <= currentStep }" />
      </div>
      <button v-if="phase === 'playing'" type="button" class="intro-player__skip" @click="skip">
        {{ skipLabel }}
        <svg class="intro-player__skip-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <polygon points="5 4 15 12 5 20 5 4" />
          <line x1="19" x2="19" y1="5" y2="19" />
        </svg>
      </button>
    </div>
    <div class="intro-player__controls">
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{
  src: string
  poster?: string
  typeLabel: string
  title: string
  hint: string
  startLabel: string
  skipLabel: string
  enterFullscreenLabel: string
  exitFullscreenLabel: string
  unmuteLabel: string
  muteLabel: string
}>()

const emit = defineEmits<{ done: [] }>()

type Phase = 'start' | 'playing' | 'done'

const STEPS = [1, 2, 3]
const STEP_BY_PHASE: Record<Phase, number> = { start: 1, playing: 2, done: 3 }

const videoRef = ref<HTMLVideoElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const phase = ref<Phase>('start')
const currentStep = computed(() => STEP_BY_PHASE[phase.value])
const canFullscreen = ref(false)
const isFullscreen = ref(false)
const isMuted = ref(false)
// Ролик играть нельзя (reduced-motion или ошибка загрузки): «Начать» ведёт сразу к содержимому
const isVideoUnavailable = ref(false)

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
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

$edge: rgb(0 0 0 / 0.5);

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

.intro-player {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  overflow: hidden;
  background: var(--color-night);
  color: var(--color-white);

  &__pcb {
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

  &__video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;

    &--hidden {
      visibility: hidden;
    }
  }

  &__scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(rgb(var(--rgb-night) / 0.2), rgb(var(--rgb-night) / 0.75));
  }

  &__start {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    padding: 72px 16px;
  }

  &__console {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    padding: 40px 22px 28px;
    border: 3px solid var(--color-blue-dark);
    border-radius: 32px;
    background: rgb(var(--rgb-white) / 0.07);
    box-shadow:
      0 8px 0 $edge,
      0 0 40px rgb(var(--rgb-blue) / 0.25);
  }

  &__leds {
    position: absolute;
    top: 14px;
    left: 24px;
    display: flex;
    gap: 6px;
  }

  &__led {
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

  &__type {
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

  &__title {
    margin: 18px 0 0;
    color: var(--color-white);
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 700;
    line-height: 1.22;
    overflow-wrap: anywhere;
  }

  &__hint {
    width: 100%;
    margin: 14px 0 26px;
    padding: 14px 16px;
    border-radius: 16px;
    background: rgb(0 0 0 / 0.3);
    color: var(--color-white);
    font-family: var(--font-body);
    font-size: 18px;
    line-height: 1.4;
  }

  &__start-button {
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
  }

  &__start-icon,
  &__skip-icon,
  &__icon {
    display: block;
    flex: none;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &__start-icon {
    width: 30px;
    height: 30px;
    fill: currentcolor;
  }

  &__skip-icon {
    width: 22px;
    height: 22px;
    fill: currentcolor;
  }

  &__icon {
    width: 26px;
    height: 26px;
  }

  &__top {
    position: absolute;
    top: 26px;
    right: 20px;
    left: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  &__steps {
    display: flex;
    flex: 1;
    gap: 6px;
  }

  &__step {
    display: block;
    flex: 1;
    height: 10px;
    border-radius: 5px;
    background: rgb(var(--rgb-white) / 0.4);

    &--on {
      background: var(--color-green-light);
      box-shadow: 0 0 8px rgb(124 200 88 / 0.7);
    }
  }

  &__skip {
    @include pressable(5px, 1px);

    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 8px;
    min-height: 52px;
    padding: 0 20px;
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

  &__controls {
    position: absolute;
    right: 20px;
    bottom: 32px;
    display: flex;
    gap: 14px;
  }

  &__control {
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
  }

  &__content {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
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
}
</style>
