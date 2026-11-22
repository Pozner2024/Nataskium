import { inject, ref } from 'vue'
import type { IntroEntranceTargets } from '@/entities/intro-theme'
import { PLAYER_ENTRANCE_KEY } from './playerKeys'

// Вылет первого вопроса. Без проигрывателя (тесты виджетов) или после первого вопроса — сразу «приземлено»
export function useFirstEntrance() {
  const context = inject(PLAYER_ENTRANCE_KEY, null)
  const entrance = context?.take() ?? null
  const landed = ref(entrance === null)

  async function play(targets: IntroEntranceTargets): Promise<void> {
    if (!entrance) return
    try {
      await entrance.run(targets)
    } finally {
      landed.value = true
    }
  }

  return {
    swap: context?.swap?.() ?? null,
    framed: context?.framed ?? false,
    hasEntrance: entrance !== null,
    landed,
    play,
    cancel: () => entrance?.cancel(),
  }
}
