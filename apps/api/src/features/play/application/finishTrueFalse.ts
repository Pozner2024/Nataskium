import { QUESTION_POINTS, summarizeQuiz } from '@nataskium/shared/grading'
import type { PlayTrueFalseFinishInput, PlayTrueFalseFinishResponse } from '@nataskium/shared/schemas'
import type { PlayTrueFalseSource } from '../types'
import { gradeTrueFalse } from './gradeTrueFalse'
import { loadPlayableQuiz } from './loadPlayableQuiz'
import { playInvalid, playVersionConflict } from './playErrors'
import { quizVersion } from './quizVersion'

const NO_POINTS = 0

// answers[i] — ответ на утверждение i, null — «не отвечено» (0 баллов, ADR-0012)
export function makeFinishTrueFalse(deps: { trueFalses: PlayTrueFalseSource }) {
  return async function finishTrueFalse(shareToken: string, input: PlayTrueFalseFinishInput): Promise<PlayTrueFalseFinishResponse> {
    const trueFalse = await loadPlayableQuiz(deps.trueFalses, shareToken)
    if (input.version !== quizVersion(trueFalse)) throw playVersionConflict()
    if (input.answers.length !== trueFalse.items.length) throw playInvalid('Wrong number of answers')

    const hits = gradeTrueFalse(trueFalse.items, input.answers)
    const result = summarizeQuiz(hits.map((hit) => (hit ? QUESTION_POINTS : NO_POINTS)), trueFalse.gradingScale)
    if (!trueFalse.showAnswers) return { result }
    // Правильные ответы раскрываются только после проверки и только при showAnswers
    return { result, review: trueFalse.items.map(({ answer }, index) => ({ correct: hits[index] ?? false, answer })) }
  }
}
