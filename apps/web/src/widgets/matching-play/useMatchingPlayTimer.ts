import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { usePlayTimer, type PlayTimerView } from '@/features/play-session'
import { useMatchingPlayStore } from './store'

export function useMatchingPlayTimer(): PlayTimerView {
  const store = useMatchingPlayStore()
  const { timer, startedAt, elapsedSeconds, timedOut, phase } = storeToRefs(store)
  return usePlayTimer({
    timer,
    startedAt,
    elapsedSeconds,
    timedOut,
    isFinished: computed(() => phase.value === 'result'),
    // Позднее связывание: метод store может быть подменён после создания таймера
    expire: () => store.expire(),
  })
}
