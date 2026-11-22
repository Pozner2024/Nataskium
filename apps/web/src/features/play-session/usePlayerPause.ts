import { inject, watch } from 'vue'
import { PLAYER_PAUSE_KEY } from './playerKeys'

// Пауза от проигрывателя (окно «Как играть»); без проигрывателя паузы не бывает
export function usePlayerPause(pause: () => void, resume: () => void): void {
  const paused = inject(PLAYER_PAUSE_KEY, null)
  if (paused === null) return
  watch(paused, (isPaused) => (isPaused ? pause() : resume()))
}
