import type { QuizRepository } from '../types'
import { quizNotFound } from './quizErrors'

export function makeDeleteQuiz(deps: { quizzes: QuizRepository }) {
  return async function deleteQuiz(teacherId: string, id: string): Promise<void> {
    if (!(await deps.quizzes.softDeleteOwned(id, teacherId))) throw quizNotFound()
  }
}
