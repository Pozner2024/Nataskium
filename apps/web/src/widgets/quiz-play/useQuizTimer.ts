import { computed, onScopeDispose, ref, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import { useI18n } from '#imports'
import { formatClock } from './formatClock'
import { usePlayStore } from './store'

const TICK_MS = 1000
const MS_PER_SECOND = 1000
const LOW_TIME_MAX_SECONDS = 60
const LOW_TIME_SHARE = 0.25

export type QuizTimerView = {
  elapsedSeconds: ComputedRef<number>
  remainingSeconds: ComputedRef<number | null>
  isLow: ComputedRef<boolean>
  announcement: Ref<string>
}

export const QUIZ_TIMER_KEY: InjectionKey<QuizTimerView> = Symbol('quiz-timer')

// Остаток считается по меткам Date.now(): в фоновой вкладке setInterval замедляется, а устройство может заснуть
export function useQuizTimer(): QuizTimerView {
  const { t } = useI18n()
  const store = usePlayStore()
  const now = ref(Date.now())
  const announcement = ref('')
  let intervalId: ReturnType<typeof setInterval> | null = null

  const limitSeconds = computed(() => (store.timer.mode === 'limit' ? store.timer.seconds : null))
  const lowThreshold = computed(() =>
    limitSeconds.value === null ? null : Math.min(LOW_TIME_MAX_SECONDS, Math.floor(limitSeconds.value * LOW_TIME_SHARE)),
  )
  const liveElapsed = computed(() =>
    store.startedAt === null ? 0 : Math.max(0, Math.floor((now.value - store.startedAt) / MS_PER_SECOND)),
  )
  const elapsedSeconds = computed(() => store.elapsedSeconds ?? liveElapsed.value)
  const remainingSeconds = computed(() =>
    limitSeconds.value === null ? null : Math.max(0, limitSeconds.value - elapsedSeconds.value),
  )
  const isLow = computed(() => {
    if (remainingSeconds.value === null || lowThreshold.value === null) return false
    return remainingSeconds.value <= lowThreshold.value
  })
  const isRunning = computed(() => store.startedAt !== null && store.timer.mode !== 'none' && store.phase !== 'result' && !store.timedOut)

  function tick(): void {
    now.value = Date.now()
    if (remainingSeconds.value === 0) void store.expire()
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

  watch([isRunning, () => store.startedAt], () => {
    if (isRunning.value) start()
    else stop()
  })

  watch(isLow, (low) => {
    if (store.timedOut) return
    announcement.value = low ? t('play.timer.lowAnnouncement', { time: formatClock(remainingSeconds.value ?? 0) }) : ''
  })
  watch(() => store.timedOut, (timedOut) => {
    announcement.value = timedOut ? t('play.timer.timeUp') : ''
  })

  onScopeDispose(stop)

  return { elapsedSeconds, remainingSeconds, isLow, announcement }
}
