import type { QuizWriteDeps } from '../types'
import { discardImages } from './quizImages'
import { quizNotFound } from './quizErrors'

export function makeDeleteQuiz(deps: Omit<QuizWriteDeps, 'quizzes'>) {
  return async function deleteQuiz(teacherId: string, id: string): Promise<void> {
    // Мягко удаляется только викторина; её картинки удаляются сразу
    const detached = await deps.transaction(async ({ quizzes, images }) => {
      if (!(await quizzes.softDeleteOwned(id, teacherId))) throw quizNotFound()
      return images.detachMissing(id, teacherId, [])
    })
    await discardImages(deps.imageFiles, detached)
  }
}
