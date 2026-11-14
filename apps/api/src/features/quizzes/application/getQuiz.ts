import type { QuizRepository, StoredQuiz } from '../types'
import { quizNotFound } from './quizErrors'

export function makeGetQuiz(deps: { quizzes: QuizRepository }) {
  return async function getQuiz(teacherId: string, id: string): Promise<StoredQuiz> {
    const quiz = await deps.quizzes.findOwned(id, teacherId)
    if (quiz === null) throw quizNotFound()
    return quiz
  }
}
