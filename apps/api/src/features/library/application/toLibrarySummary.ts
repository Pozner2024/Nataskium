import { type LibraryQuizSummary, type MatchingPair, type QuizQuestion, matchingInputSchema, quizInputSchema } from '@nataskium/shared/schemas'
import type { LibraryQuizMeta, LibraryQuizRow } from '../types'

// Строка, не прошедшая схему, — рассинхрон данных и кода: внутренняя ошибка (500), а не ошибка клиента
export function parseQuestions(row: LibraryQuizRow): QuizQuestion[] {
  const parsed = quizInputSchema.shape.questions.safeParse(row.questions)
  if (!parsed.success) throw new Error(`Library quiz ${row.number} does not match the quiz schema`)
  return parsed.data
}

// Пары сопоставления лежат в той же колонке questions (ADR-0013)
export function parsePairs(row: LibraryQuizRow): MatchingPair[] {
  const parsed = matchingInputSchema.shape.pairs.safeParse(row.questions)
  if (!parsed.success) throw new Error(`Library matching ${row.number} does not match the matching schema`)
  return parsed.data
}

export function toLibrarySummary(row: LibraryQuizMeta, questionCount: number): LibraryQuizSummary {
  return {
    number: row.number,
    type: row.type,
    title: row.title,
    groupSlug: row.groupSlug,
    questionCount,
    graded: row.graded,
    createdAt: row.createdAt.toISOString(),
  }
}
