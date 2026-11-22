import { inject } from 'vue'
import type { GameSoundName } from '@/entities/intro-theme'
import { PLAYER_SOUND_KEY } from './playerKeys'

// Звук ответа в игре. Без проигрывателя (тесты, страницы без интро) — пустая функция
export function usePlayerSound(): (name: GameSoundName) => void {
  return inject(PLAYER_SOUND_KEY, () => {})
}
