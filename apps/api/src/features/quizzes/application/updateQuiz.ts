import type { QuizInput } from '@nataskium/shared/schemas'
import type { QuizWriteDeps, StoredQuiz } from '../types'
import { collectImageIds, discardImages, syncQuizImages } from './quizImages'
import { quizNotFound, unknownGroup } from './quizErrors'

export function makeUpdateQuiz(deps: QuizWriteDeps) {
  return async function updateQuiz(teacherId: string, id: string, input: QuizInput): Promise<StoredQuiz> {
    const imageIds = collectImageIds(input, deps.imageFiles)
    if (!(await deps.quizzes.groupExists(input.group))) throw unknownGroup()
    const detached = await deps.transaction(async ({ quizzes, images }) => {
      // Владелец проверяется здесь, до привязки картинок: attach владельца викторины не проверяет
      if (!(await quizzes.updateOwned(id, teacherId, input))) throw quizNotFound()
      return syncQuizImages(images, id, teacherId, imageIds)
    })
    await discardImages(deps.imageFiles, detached)

    const quiz = await deps.quizzes.findOwned(id, teacherId)
    // Удалена между обновлением и чтением
    if (quiz === null) throw quizNotFound()
    return quiz
  }
}
