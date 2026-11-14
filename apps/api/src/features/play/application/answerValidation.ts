import type { PlayableQuiz } from '../types'
import { playInvalid } from './playErrors'

type Question = PlayableQuiz['questions'][number]

export function correctIndexes(question: Question): number[] {
  return question.options.flatMap((option, index) => (option.isCorrect ? [index] : []))
}

// Уникальность и диапазон 0…5 уже проверила схема; здесь — соответствие конкретному вопросу
export function assertSelectionFits(question: Question, selected: readonly number[]): void {
  if (selected.length !== correctIndexes(question).length) throw playInvalid('Wrong number of selected options')
  if (selected.some((index) => index >= question.options.length)) throw playInvalid('Option index out of range')
}
