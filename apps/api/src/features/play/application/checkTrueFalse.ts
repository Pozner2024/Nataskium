import type { PlayTrueFalseCheckInput, PlayTrueFalseCheckResponse } from '@nataskium/shared/schemas'
import type { PlayTrueFalseSource } from '../types'
import { loadPlayableQuiz } from './loadPlayableQuiz'
import { playInvalid, playQuizNotFound, playVersionConflict } from './playErrors'
import { quizVersion } from './quizVersion'

export function makeCheckTrueFalse(deps: { trueFalses: PlayTrueFalseSource }) {
  return async function checkTrueFalse(shareToken: string, input: PlayTrueFalseCheckInput): Promise<PlayTrueFalseCheckResponse> {
    const trueFalse = await loadPlayableQuiz(deps.trueFalses, shareToken)
    // Ответы скрыты учителем: маршрут для ученика не существует
    if (!trueFalse.showAnswers) throw playQuizNotFound()
    if (input.version !== quizVersion(trueFalse)) throw playVersionConflict()

    const item = trueFalse.items[input.index]
    if (item === undefined) throw playInvalid('Item index out of range')
    return { correct: input.answer === item.answer }
  }
}
