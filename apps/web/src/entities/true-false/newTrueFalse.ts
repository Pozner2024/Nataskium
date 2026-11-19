import { MIN_TRUE_FALSE_ITEMS } from '@nataskium/shared/schemas'
import type { TrueFalseDraft, TrueFalseDraftItem } from './types'

export function newItem(): TrueFalseDraftItem {
  return { statement: '', answer: null }
}

// Сразу минимум утверждений, раздел пустой: учитель выбирает его сам, схема не даст сохранить без выбора
export function newTrueFalse(): TrueFalseDraft {
  return {
    title: '',
    showAnswers: true,
    gradingScale: null,
    group: '',
    timer: { mode: 'none' },
    items: Array.from({ length: MIN_TRUE_FALSE_ITEMS }, newItem),
  }
}
