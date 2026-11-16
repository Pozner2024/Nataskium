import type { QuizSummary } from '@nataskium/shared/schemas'
import type { QuizRepository } from '../types'

export function makeListQuizzes(deps: { quizzes: QuizRepository }) {
  return function listQuizzes(teacherId: string): Promise<QuizSummary[]> {
    return deps.quizzes.listByTeacher(teacherId)
  }
}
