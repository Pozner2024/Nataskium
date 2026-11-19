import type { GradingScaleType } from '@nataskium/shared/grading'
import type { MatchingInput, QuizInput, TrueFalseInput } from '@nataskium/shared/schemas'

// Только то, что нужно игре ученика. Фича не знает о репозитории викторин: связывание в app.ts
export type PlayableQuiz = Pick<QuizInput, 'title' | 'showAnswers' | 'timer' | 'questions'> & {
  gradingScale: GradingScaleType | null
  updatedAt: Date
}

export type PlayQuizSource = {
  // Удалённые викторины не находятся
  findByShareToken(token: string): Promise<PlayableQuiz | null>
}

export type PlayableMatching = Pick<MatchingInput, 'title' | 'showAnswers' | 'timer' | 'pairs'> & {
  gradingScale: GradingScaleType | null
  updatedAt: Date
}

export type PlayMatchingSource = {
  // Только type = matching; удалённые не находятся
  findByShareToken(token: string): Promise<PlayableMatching | null>
}

export type PlayableTrueFalse = Pick<TrueFalseInput, 'title' | 'showAnswers' | 'timer' | 'items'> & {
  gradingScale: GradingScaleType | null
  updatedAt: Date
}

export type PlayTrueFalseSource = {
  // Только type = truefalse; удалённые не находятся
  findByShareToken(token: string): Promise<PlayableTrueFalse | null>
}

// Порядок слов для ученика; в app.ts — secureShuffle, в тестах — детерминированный
export type PlayShuffle = <T>(items: readonly T[]) => T[]

// Адрес картинки по id; null — хранилище не настроено. Связывание с хранилищем — в app.ts
export type PlayImageUrl = (imageId: string) => string | null
