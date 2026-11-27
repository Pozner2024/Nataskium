import { computed, inject, ref } from 'vue'
import type { IntroEntranceTargets, QuestionSwap } from '@/entities/intro-theme'
import { PLAYER_ENTRANCE_KEY } from './playerKeys'

// Вылет первого вопроса. Без проигрывателя (тесты виджетов) или после первого вопроса — сразу «приземлено»
export function useFirstEntrance() {
  const context = inject(PLAYER_ENTRANCE_KEY, null)
  const entrance = context?.take() ?? null
  const landed = ref(entrance === null)
  const framed = computed(() => context?.framed ?? false)
  let activeSwap: QuestionSwap | null = null

  async function play(targets: IntroEntranceTargets): Promise<void> {
    if (!entrance) return
    try {
      await entrance.run(targets)
    } finally {
      landed.value = true
    }
  }

  async function swap(targets: { card: HTMLElement; items: HTMLElement[] }): Promise<void> {
    const next = context?.swap?.() ?? null
    if (activeSwap && activeSwap !== next) activeSwap.cancel()
    activeSwap = next
    if (!next) return
    await next.enter(targets)
  }

  function cancel(): void {
    entrance?.cancel()
    activeSwap?.cancel()
    activeSwap = null
  }

  return {
    framed,
    hasEntrance: entrance !== null,
    landed,
    play,
    swap,
    cancel,
  }
}
