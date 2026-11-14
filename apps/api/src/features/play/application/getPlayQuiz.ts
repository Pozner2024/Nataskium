import type { PlayQuizResponse } from '@nataskium/shared/schemas'
import type { PlayQuizSource } from '../types'
import { loadPlayableQuiz } from './loadPlayableQuiz'
import { quizVersion } from './quizVersion'

export function makeGetPlayQuiz(deps: { quizzes: PlayQuizSource }) {
  return async function getPlayQuiz(shareToken: string): Promise<PlayQuizResponse> {
    const quiz = await loadPlayableQuiz(deps.quizzes, shareToken)
    // Поля собираются явно: isCorrect и индексы правильных не должны попасть в ответ ни при каких правках модели
    return {
      quiz: {
        title: quiz.title,
        showAnswers: quiz.showAnswers,
        version: quizVersion(quiz),
        questions: quiz.questions.map((question) => ({
          text: question.text,
          options: question.options.map((option) => option.text),
          selectCount: question.options.filter((option) => option.isCorrect).length,
        })),
      },
    }
  }
}
