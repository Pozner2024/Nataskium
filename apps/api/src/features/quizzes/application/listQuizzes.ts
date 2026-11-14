import type { QuizRepository, StoredQuiz } from '../types'

export function makeListQuizzes(deps: { quizzes: QuizRepository }) {
  return function listQuizzes(teacherId: string): Promise<StoredQuiz[]> {
    return deps.quizzes.listByTeacher(teacherId)
  }
}
