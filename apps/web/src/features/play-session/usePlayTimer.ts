import type { QuizTimer } from '@nataskium/shared/schemas'
import { computed, onScopeDispose, ref, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import { useI18n } from '#imports'
import { formatClock } from './formatClock'

const TICK_MS = 1000
const MS_PER_SECOND = 1000
const LOW_TIME_MAX_SECONDS = 60
const LOW_TIME_SHARE = 0.25

export type PlayTimerSource = {
  timer: Readonly<Ref<QuizTimer>>
  startedAt: Readonly<Ref<number | null>>
  elapsedSeconds: Readonly<Ref<number | null>>
  timedOut: Readonly<Ref<boolean>>
  isFinished: Readonly<Ref<boolean>>
  expire: () => Promise<void> | void
}

export type PlayTimerView = {
  elapsedSeconds: ComputedRef<number>
  remainingSeconds: ComputedRef<number | null>
  isLow: ComputedRef<boolean>
  announcement: Ref<string>
  // Для плавного кольца: старт по Date.now(), лимит и идёт ли отсчёт. Необязательны — у заглушек в тестах их нет
  startedAt?: Readonly<Ref<number | null>>
  limitSeconds?: ComputedRef<number | null>
  isRunning?: ComputedRef<boolean>
}

export const PLAY_TIMER_KEY: InjectionKey<PlayTimerView> = Symbol('play-timer')

// Остаток считается по меткам Date.now(): в фоновой вкладке setInterval замедляется, а устройство может заснуть
export function usePlayTimer(source: PlayTimerSource): PlayTimerView {
  const { t } = useI18n()
  const now = ref(Date.now())
  const announcement = ref('')
  let intervalId: ReturnType<typeof setInterval> | null = null

  const limitSeconds = computed(() => (source.timer.value.mode === 'limit' ? source.timer.value.seconds : null))
  const lowThreshold = computed(() =>
    limitSeconds.value === null ? null : Math.min(LOW_TIME_MAX_SECONDS, Math.floor(limitSeconds.value * LOW_TIME_SHARE)),
  )
  const liveElapsed = computed(() =>
    source.startedAt.value === null ? 0 : Math.max(0, Math.floor((now.value - source.startedAt.value) / MS_PER_SECOND)),
  )
  const elapsedSeconds = computed(() => source.elapsedSeconds.value ?? liveElapsed.value)
  const remainingSeconds = computed(() =>
    limitSeconds.value === null ? null : Math.max(0, limitSeconds.value - elapsedSeconds.value),
  )
  const isLow = computed(() => {
    if (remainingSeconds.value === null || lowThreshold.value === null) return false
    return remainingSeconds.value <= lowThreshold.value
  })
  const isRunning = computed(
    () => source.startedAt.value !== null && source.timer.value.mode !== 'none' && !source.isFinished.value && !source.timedOut.value,
  )

  function tick(): void {
    now.value = Date.now()
    if (remainingSeconds.value === 0) void source.expire()
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') tick()
  }

  function stop(): void {
    if (intervalId === null) return
    clearInterval(intervalId)
    intervalId = null
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  function start(): void {
    stop()
    tick()
    if (!isRunning.value) return
    intervalId = setInterval(tick, TICK_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  // immediate: источник может быть уже запущен к моменту создания таймера
  watch(
    [isRunning, source.startedAt],
    () => {
      if (isRunning.value) start()
      else stop()
    },
    { immediate: true },
  )

  watch(isLow, (low) => {
    if (source.timedOut.value) return
    announcement.value = low ? t('play.timer.lowAnnouncement', { time: formatClock(remainingSeconds.value ?? 0) }) : ''
  })
  watch(source.timedOut, (timedOut) => {
    announcement.value = timedOut ? t('play.timer.timeUp') : ''
  })

  onScopeDispose(stop)

  return { elapsedSeconds, remainingSeconds, isLow, announcement, startedAt: source.startedAt, limitSeconds, isRunning }
}
