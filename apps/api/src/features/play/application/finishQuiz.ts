import { scoreQuestion, summarizeQuiz } from '@nataskium/shared/grading'
import type { PlayFinishInput, PlayFinishResponse } from '@nataskium/shared/schemas'
import type { PlayQuizSource } from '../types'
import { assertSelectionFits, correctIndexes } from './answerValidation'
import { loadPlayableQuiz } from './loadPlayableQuiz'
import { playInvalid, playVersionConflict } from './playErrors'
import { quizVersion } from './quizVersion'

export function makeFinishQuiz(deps: { quizzes: PlayQuizSource }) {
  return async function finishQuiz(shareToken: string, input: PlayFinishInput): Promise<PlayFinishResponse> {
    const quiz = await loadPlayableQuiz(deps.quizzes, shareToken)
    if (input.version !== quizVersion(quiz)) throw playVersionConflict()
    if (input.answers.length !== quiz.questions.length) throw playInvalid('Wrong number of answers')

    const points = quiz.questions.map((question, index) => {
      const selected = input.answers[index] ?? []
      assertSelectionFits(question, selected)
      return scoreQuestion(selected, correctIndexes(question))
    })
    return { result: summarizeQuiz(points, quiz.gradingScale) }
  }
}
