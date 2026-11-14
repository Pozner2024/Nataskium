import type { QuizInput } from '@nataskium/shared/schemas'
import type { QuizRepository, StoredQuiz } from '../types'
import { quizNotFound } from './quizErrors'

export function makeUpdateQuiz(deps: { quizzes: QuizRepository }) {
  return async function updateQuiz(teacherId: string, id: string, input: QuizInput): Promise<StoredQuiz> {
    if (!(await deps.quizzes.updateOwned(id, teacherId, input))) throw quizNotFound()

    const quiz = await deps.quizzes.findOwned(id, teacherId)
    // Удалена между обновлением и чтением
    if (quiz === null) throw quizNotFound()
    return quiz
  }
}
