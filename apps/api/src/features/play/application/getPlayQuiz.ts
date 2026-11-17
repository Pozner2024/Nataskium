import type { PlayQuizResponse } from '@nataskium/shared/schemas'
import type { PlayImageUrl, PlayQuizSource, PlayableQuiz } from '../types'
import { loadPlayableQuiz } from './loadPlayableQuiz'
import { quizVersion } from './quizVersion'

// Поля собираются явно: isCorrect и индексы правильных не должны попасть в ответ ни при каких правках модели.
// Адрес картинки строится из её случайного id и не зависит от правильности варианта
export function toPlayQuizResponse(quiz: PlayableQuiz, imageUrl: PlayImageUrl): PlayQuizResponse {
  const urlOf = (imageId: string | null) => (imageId === null ? null : imageUrl(imageId))
  return {
    type: 'quiz',
    quiz: {
      title: quiz.title,
      showAnswers: quiz.showAnswers,
      timer: quiz.timer,
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

export function makeGetPlayQuiz(deps: { quizzes: PlayQuizSource; imageUrl: PlayImageUrl }) {
  return async function getPlayQuiz(shareToken: string): Promise<PlayQuizResponse> {
    return toPlayQuizResponse(await loadPlayableQuiz(deps.quizzes, shareToken), deps.imageUrl)
  }
}
