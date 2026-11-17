import { MIN_MATCHING_PAIRS } from '@nataskium/shared/schemas'
import type { MatchingInput, MatchingPair } from './types'

export function newPair(): MatchingPair {
  return { term: '', definition: '' }
}

// Сразу минимум пар, раздел пустой: учитель выбирает его сам, схема не даст сохранить без выбора
export function newMatching(): MatchingInput {
  return {
    title: '',
    showAnswers: true,
    gradingScale: null,
    group: '',
    timer: { mode: 'none' },
    pairs: Array.from({ length: MIN_MATCHING_PAIRS }, newPair),
  }
}
