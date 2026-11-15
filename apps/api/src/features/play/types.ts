import type { GradingScaleType } from '@nataskium/shared/grading'
import type { QuizInput } from '@nataskium/shared/schemas'

// Только то, что нужно игре ученика. Фича не знает о репозитории викторин: связывание в app.ts
export type PlayableQuiz = Pick<QuizInput, 'title' | 'showAnswers' | 'questions'> & {
  gradingScale: GradingScaleType | null
  updatedAt: Date
}

export type PlayQuizSource = {
  // Удалённые викторины не находятся
  findByShareToken(token: string): Promise<PlayableQuiz | null>
}

// Адрес картинки по id; null — хранилище не настроено. Связывание с хранилищем — в app.ts
export type PlayImageUrl = (imageId: string) => string | null
