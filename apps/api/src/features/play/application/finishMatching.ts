import { QUESTION_POINTS, summarizeQuiz } from '@nataskium/shared/grading'
import type { PlayMatchingFinishInput, PlayMatchingFinishResponse } from '@nataskium/shared/schemas'
import type { PlayMatchingSource } from '../types'
import { loadPlayableQuiz } from './loadPlayableQuiz'
import { playInvalid, playVersionConflict } from './playErrors'
import { quizVersion } from './quizVersion'

const NO_POINTS = 0

// answers[i] — слово для определения i, null — «не отвечено» (0 баллов, ADR-0012). Слова сравниваются по точному тексту:
// ученик получает их из GET и присылает без изменений, иначе слово не из задания — 400.
// Повтор слова отсекает схема: иначе одно слово «попало» бы в несколько определений и завысило процент
export function makeFinishMatching(deps: { matchings: PlayMatchingSource }) {
  return async function finishMatching(shareToken: string, input: PlayMatchingFinishInput): Promise<PlayMatchingFinishResponse> {
    const matching = await loadPlayableQuiz(deps.matchings, shareToken)
    if (input.version !== quizVersion(matching)) throw playVersionConflict()
    if (input.answers.length !== matching.pairs.length) throw playInvalid('Wrong number of answers')
    const terms = new Set(matching.pairs.map((pair) => pair.term))
    if (input.answers.some((answer) => answer !== null && !terms.has(answer))) throw playInvalid('Unknown term')

    const hits = matching.pairs.map((pair, index) => input.answers[index] === pair.term)
    const result = summarizeQuiz(hits.map((hit) => (hit ? QUESTION_POINTS : NO_POINTS)), matching.gradingScale)
    if (!matching.showAnswers) return { result }
    // Правильные пары раскрываются только после проверки и только при showAnswers
    return { result, review: matching.pairs.map((pair, index) => ({ correct: hits[index]!, term: pair.term })) }
  }
}
