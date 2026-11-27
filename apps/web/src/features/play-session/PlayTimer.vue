<template>
  <div
    v-if="timer && mode !== 'none'"
    class="play-timer"
    :class="{ 'play-timer--limit': isLimit, 'play-timer--low': timer.isLow.value, 'play-timer--active': isActive }"
    role="timer"
    :aria-label="t('play.timer.label')"
  >
    <span class="play-timer__caption">{{ isLimit ? t('play.timer.remainingCaption') : t('play.timer.elapsedCaption') }}</span>
    <span class="play-timer__dial" :style="dialStyle">
      <svg class="play-timer__svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle class="play-timer__track" cx="50" cy="50" :r="RADIUS" />
        <!-- Новый круг на каждом обороте секундомера: дуга не «отматывается» назад анимацией -->
        <circle :key="turn" class="play-timer__fill" cx="50" cy="50" :r="RADIUS" />
        <circle class="play-timer__ticks" cx="50" cy="50" :r="RADIUS" />
      </svg>
      <span class="play-timer__time" :style="{ '--chars': clock.length }">{{ clock }}</span>
    </span>
    <span v-if="timer.isLow.value" class="play-timer__low">{{ t('play.timer.low') }}</span>
  </div>
</template>

<script setup lang="ts">
import type { QuizTimer } from '@nataskium/shared/schemas'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { formatClock } from './formatClock'
import { PLAYER_TIMER_SLOT_KEY } from './playerKeys'
import { PLAY_TIMER_KEY } from './usePlayTimer'

const props = defineProps<{ mode: QuizTimer['mode'] }>()

// Геометрия кольца секундомера (SVG viewBox 100×100)
const RADIUS = 45
const LENGTH = 2 * Math.PI * RADIUS
const MS_PER_SECOND = 1000
// Полоса — секундная стрелка: оборот за минуту в любом режиме, риска на каждую секунду, как в исходнике.
// Остаток лимита показывают цифры
const TURN_SECONDS = 60
const TICK_SECONDS = 1

const { t } = useI18n()
const timer = inject(PLAY_TIMER_KEY, null)
const playerSlot = inject(PLAYER_TIMER_SLOT_KEY, null)

const isLimit = computed(() => props.mode === 'limit')
const shownSeconds = computed(() => (isLimit.value ? timer?.remainingSeconds.value : timer?.elapsedSeconds.value) ?? 0)
const clock = computed(() => formatClock(shownSeconds.value))
const limitSeconds = computed(() => {
  if (!isLimit.value || !timer) return 0
  return timer.limitSeconds?.value ?? (timer.remainingSeconds.value ?? 0) + timer.elapsedSeconds.value
})

// Кольцо движется каждый кадр по реальному времени, как в исходнике (requestAnimationFrame).
// Цифры — из usePlayTimer: оба считают от одной метки старта по Date.now(), поэтому совпадают.
// При reduced-motion кадров нет: кольцо шагает раз в секунду вместе с цифрами
const frameElapsed = ref<number | null>(null)
const prefersReducedMotion = ref(false)
let frame: number | null = null

function drawFrame(): void {
  const startedAt = timer?.startedAt?.value ?? null
  frameElapsed.value = startedAt === null ? null : Math.max(0, (Date.now() - startedAt) / MS_PER_SECOND)
  frame = requestAnimationFrame(drawFrame)
}

function stopFrames(): void {
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
  frameElapsed.value = null
}

const isAnimated = computed(() => Boolean(timer?.isRunning?.value) && props.mode !== 'none' && !prefersReducedMotion.value)

watch(isAnimated, (animated) => {
  stopFrames()
  if (animated) frame = requestAnimationFrame(drawFrame)
})

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (isAnimated.value) frame = requestAnimationFrame(drawFrame)
})

const ringElapsed = computed(() => frameElapsed.value ?? timer?.elapsedSeconds.value ?? 0)
const isActive = computed(() => !isLimit.value || (timer?.remainingSeconds.value ?? 0) > 0)
const turn = computed(() => Math.floor(ringElapsed.value / TURN_SECONDS))

// Доля дуги — секунды текущей минуты: полоса растёт от верха по часовой, как в исходнике
const share = computed(() => {
  // Лимит истёк — полоса сбрасывается в пустую, как stop() в исходнике
  if (isLimit.value && ringElapsed.value >= limitSeconds.value) return 0
  return (ringElapsed.value % TURN_SECONDS) / TURN_SECONDS
})

const ticks = { duration: TURN_SECONDS, step: TICK_SECONDS }

const dialStyle = computed(() => ({
  '--offset': `${LENGTH * (1 - share.value)}px`,
  '--duration': ticks.duration,
  '--step': ticks.step,
}))

// Проигрыватель отводит колонку под таймер, только пока таймер показан
let detach: (() => void) | null = null

watch(
  () => Boolean(timer && props.mode !== 'none' && playerSlot?.target.value),
  (shown) => {
    detach?.()
    detach = shown && playerSlot ? playerSlot.attach() : null
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  detach?.()
  stopFrames()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints.module' as *;

// Цифры помещаются во внутренний круг с запасом: внутренний диаметр — 80% размера (кольцо 10 из 100 с каждой стороны),
// строка занимает не больше 62% его ширины. Ширина строки в em у Onest bold с табличными цифрами:
// 0.67 на цифру и 0.28 на двоеточие — шрифт уменьшается, когда знаков больше (12:34, 180:00)
$inner-share: 0.8;
$text-share: 0.62;
$digit-em: 0.67;
$colon-em: 0.28;

.play-timer {
  --size: 48px;
  --ring-color: var(--g-timer-fill, var(--color-blue));

  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--g-timer-text, var(--color-blue-dark));

  @include tablet {
    --size: 64px;
  }

  @include desktop {
    --size: 96px;
  }

  :fullscreen & {
    @include desktop {
      --size: 112px;
    }
  }
}

.play-timer--low {
  --ring-color: var(--g-timer-low, var(--color-orange-dark));
}

.play-timer__dial {
  --r: 45;
  --length: calc(2 * pi * var(--r));

  position: relative;
  display: grid;
  flex: none;
  color: var(--ring-color);
  font-weight: bold;
  text-align: center;

  // Телефон — только цифры; кольцо с пульсом и волной с планшета
  @include tablet {
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    transition:
      background 0.2s ease,
      filter 0.2s ease;

    .play-timer:not(.play-timer--active) &:hover {
      background: color-mix(in srgb, var(--ring-color) 10%, transparent);
      filter: drop-shadow(0 0 22px color-mix(in srgb, var(--ring-color) 60%, transparent));
    }

    .play-timer--active & {
      animation:
        play-timer-pulse 1s infinite linear,
        play-timer-wave 1s infinite ease-out;
    }
  }
}

.play-timer__svg {
  display: none;
  grid-area: 1 / 1 / -1 / -1;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  transform: rotate(-90deg);

  @include tablet {
    display: block;
  }
}

.play-timer__track,
.play-timer__fill {
  fill: none;
  stroke-width: calc(100px - var(--r) * 2px);
}

// Дорожка — едва заметный круг цвета полосы, 5% как в исходнике
.play-timer__track {
  stroke: color-mix(in srgb, var(--ring-color) 5%, transparent);
}

.play-timer__fill {
  stroke: var(--ring-color);
  stroke-dasharray: calc(var(--length) * 1px);
  stroke-dashoffset: var(--offset);
}

// Риски — как в исходнике: белые с difference, поэтому видны и на заполненной дуге, и на пустой.
// Смешивание не выходит за SVG: у него transform, и он сам изолирует группу
.play-timer__ticks {
  --width: 0.5;
  --gap: calc(var(--length) * var(--step) / var(--duration) - var(--width));

  fill: none;
  stroke: rgb(255 255 255 / 1);
  stroke-width: 3px;
  stroke-dasharray: calc(var(--width) * 1px) calc(var(--gap) * 1px);
  rotate: calc(var(--width) * -90deg / var(--r) / pi);
  transform-origin: center center;
  mix-blend-mode: difference;
}

.play-timer__time {
  grid-area: 1 / 1 / -1 / -1;
  font-size: 22px;
  align-content: center;
  color: var(--g-timer-text, var(--color-blue-dark));
  font-family: var(--font-body);
  font-variant-numeric: tabular-nums;
  line-height: 1;

  @include tablet {
    font-size: calc(var(--size) * #{$inner-share * $text-share} / (#{$digit-em} * (var(--chars) - 1) + #{$colon-em}));
  }
}

// Подписей на экране нет: «осталось / прошло» и «мало времени» (его видно по цвету кольца) — только для скринридера
.play-timer__caption,
.play-timer__low {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@keyframes play-timer-wave {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--ring-color) 60%, transparent);
  }

  70% {
    box-shadow: 0 0 0 calc(var(--size) * 0.1) color-mix(in srgb, var(--ring-color) 0%, transparent);
  }
}

@keyframes play-timer-pulse {
  5% {
    scale: 1.01;
  }

  20% {
    scale: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .play-timer__dial {
    transition: none;
  }

  .play-timer--active .play-timer__dial {
    animation: none;
  }
}
</style>
