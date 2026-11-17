import type { PlayActivityResponse, PlayMatchingResponse } from '@nataskium/shared/schemas'
import type { PlayImageUrl, PlayMatchingSource, PlayQuizSource, PlayShuffle, PlayableMatching } from '../types'
import { toPlayQuizResponse } from './getPlayQuiz'
import { isShareTokenFormat } from './loadPlayableQuiz'
import { playQuizNotFound } from './playErrors'
import { quizVersion } from './quizVersion'

// Связи пар в ответе нет: определения в порядке учителя, слова перемешаны заново при каждом запросе, без id (ADR-0013)
export function toPlayMatchingResponse(matching: PlayableMatching, shuffle: PlayShuffle): PlayMatchingResponse {
  return {
    type: 'matching',
    matching: {
      title: matching.title,
      showAnswers: matching.showAnswers,
      timer: matching.timer,
      version: quizVersion(matching),
      definitions: matching.pairs.map((pair) => pair.definition),
      terms: shuffle(matching.pairs.map((pair) => pair.term)),
    },
  }
}

type GetPlayActivityDeps = {
  quizzes: PlayQuizSource
  matchings: PlayMatchingSource
  imageUrl: PlayImageUrl
  shuffle: PlayShuffle
}

// Одна ссылка /play/<shareToken> для любого типа: токены уникальны на всю таблицу, источники не пересекаются.
// Для токена сопоставления — один лишний индексный запрос
export function makeGetPlayActivity(deps: GetPlayActivityDeps) {
  return async function getPlayActivity(shareToken: string): Promise<PlayActivityResponse> {
    if (!isShareTokenFormat(shareToken)) throw playQuizNotFound()
    const quiz = await deps.quizzes.findByShareToken(shareToken)
    if (quiz !== null) return toPlayQuizResponse(quiz, deps.imageUrl)
    const matching = await deps.matchings.findByShareToken(shareToken)
    if (matching !== null) return toPlayMatchingResponse(matching, deps.shuffle)
    throw playQuizNotFound()
  }
}
