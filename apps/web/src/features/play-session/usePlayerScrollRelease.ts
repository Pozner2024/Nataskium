import { inject, onScopeDispose, watch } from 'vue'
import { PLAYER_SCROLL_RELEASE_KEY } from './playerKeys'

// Пока идёт игра, слот проигрывателя держит прокрутку; на итоге и при ошибке отпускает её странице
export function usePlayerScrollRelease(isReleased: () => boolean): void {
  const release = inject(PLAYER_SCROLL_RELEASE_KEY, null)
  if (!release) return
  watch(isReleased, (released) => {
    release.value = released
  }, { immediate: true })
  onScopeDispose(() => {
    release.value = false
  })
}
