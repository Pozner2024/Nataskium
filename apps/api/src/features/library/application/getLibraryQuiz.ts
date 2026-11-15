import { LIBRARY_PREVIEW_QUESTIONS, type LibraryQuizResponse } from '@nataskium/shared/schemas'
import type { LibraryImageUrl, LibraryRepository } from '../types'
import { libraryNotFound } from './libraryErrors'
import { parseQuestions, toLibrarySummary } from './toLibrarySummary'

export function makeGetLibraryQuiz(deps: { library: LibraryRepository; imageUrl: LibraryImageUrl }) {
  const urlOf = (imageId: string | null) => (imageId === null ? null : deps.imageUrl(imageId))

  return async function getLibraryQuiz(number: number): Promise<LibraryQuizResponse> {
    const row = await deps.library.findByNumber(number)
    if (row === null) throw libraryNotFound()
    const questions = parseQuestions(row)
    // Поля собираются явно: isCorrect и число верных не должны попасть в публичный ответ ни при каких правках модели
    return {
      quiz: {
        ...toLibrarySummary(row, questions.length),
        questions: questions.slice(0, LIBRARY_PREVIEW_QUESTIONS).map((question) => ({
          text: question.text,
          imageUrl: urlOf(question.imageId),
          options: question.options.map((option) => ({ text: option.text, imageUrl: urlOf(option.imageId) })),
        })),
      },
    }
  }
}
