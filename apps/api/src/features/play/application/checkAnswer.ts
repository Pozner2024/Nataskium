import type { PlayCheckInput, PlayCheckResponse } from '@nataskium/shared/schemas'
import type { PlayQuizSource } from '../types'
import { assertSelectionFits, correctIndexes } from './answerValidation'
import { loadPlayableQuiz } from './loadPlayableQuiz'
import { playInvalid, playQuizNotFound, playVersionConflict } from './playErrors'
import { quizVersion } from './quizVersion'

export function makeCheckAnswer(deps: { quizzes: PlayQuizSource }) {
  return async function checkAnswer(shareToken: string, input: PlayCheckInput): Promise<PlayCheckResponse> {
    const quiz = await loadPlayableQuiz(deps.quizzes, shareToken)
    // Ответы скрыты учителем: маршрут для ученика не существует
    if (!quiz.showAnswers) throw playQuizNotFound()
    if (input.version !== quizVersion(quiz)) throw playVersionConflict()

    const question = quiz.questions[input.questionIndex]
    if (question === undefined) throw playInvalid('Question index out of range')
    assertSelectionFits(question, input.selected)
    return { correct: correctIndexes(question) }
  }
}
