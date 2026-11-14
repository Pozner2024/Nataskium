import type { PlayQuizResponse } from '@nataskium/shared/schemas'
import type { PlayImageUrl, PlayQuizSource } from '../types'
import { loadPlayableQuiz } from './loadPlayableQuiz'
import { quizVersion } from './quizVersion'

export function makeGetPlayQuiz(deps: { quizzes: PlayQuizSource; imageUrl: PlayImageUrl }) {
  const urlOf = (imageId: string | null) => (imageId === null ? null : deps.imageUrl(imageId))

  return async function getPlayQuiz(shareToken: string): Promise<PlayQuizResponse> {
    const quiz = await loadPlayableQuiz(deps.quizzes, shareToken)
    // Поля собираются явно: isCorrect и индексы правильных не должны попасть в ответ ни при каких правках модели.
    // Адрес картинки строится из её случайного id и не зависит от правильности варианта
    return {
      quiz: {
        title: quiz.title,
        showAnswers: quiz.showAnswers,
        version: quizVersion(quiz),
        questions: quiz.questions.map((question) => ({
          text: question.text,
          imageUrl: urlOf(question.imageId),
          options: question.options.map((option) => ({ text: option.text, imageUrl: urlOf(option.imageId) })),
          selectCount: question.options.filter((option) => option.isCorrect).length,
        })),
      },
    }
  }
}
