import type { PlayActivityResponse, PlayMatchingResponse, PlayTrueFalseResponse } from '@nataskium/shared/schemas'
import type { PlayImageUrl, PlayMatchingSource, PlayQuizSource, PlayShuffle, PlayTrueFalseSource, PlayableMatching, PlayableTrueFalse } from '../types'
import { toPlayQuizResponse } from './getPlayQuiz'
import { isShareTokenFormat } from './loadPlayableQuiz'
import { playQuizNotFound } from './playErrors'
import { quizVersion } from './quizVersion'

// Связи пар в ответе нет: определения в порядке учителя, слова перемешаны заново при каждом запросе, без id (ADR-0013)
function toPlayMatchingResponse(matching: PlayableMatching, shuffle: PlayShuffle): PlayMatchingResponse {
  return {
    type: 'matching',
    matching: {
      title: matching.title,
      showAnswers: matching.showAnswers,
      timer: matching.timer,
      introTheme: matching.introTheme,
      version: quizVersion(matching),
      definitions: matching.pairs.map((pair) => pair.definition),
      terms: shuffle(matching.pairs.map((pair) => pair.term)),
    },
  }
}

// Правильных ответов в ответе нет: ученик видит только утверждения в порядке учителя
export function toPlayTrueFalseResponse(trueFalse: PlayableTrueFalse): PlayTrueFalseResponse {
  return {
    type: 'truefalse',
    trueFalse: {
      title: trueFalse.title,
      showAnswers: trueFalse.showAnswers,
      timer: trueFalse.timer,
      introTheme: trueFalse.introTheme,
      version: quizVersion(trueFalse),
      statements: trueFalse.items.map((item) => item.statement),
    },
  }
}

type GetPlayActivityDeps = {
  quizzes: PlayQuizSource
  matchings: PlayMatchingSource
  trueFalses: PlayTrueFalseSource
  imageUrl: PlayImageUrl
  shuffle: PlayShuffle
}

// Одна ссылка /play/<shareToken> для любого типа: токены уникальны на всю таблицу, источники не пересекаются.
// Для токена сопоставления — один лишний индексный запрос, для «да/нет» — два
export function makeGetPlayActivity(deps: GetPlayActivityDeps) {
  return async function getPlayActivity(shareToken: string): Promise<PlayActivityResponse> {
    if (!isShareTokenFormat(shareToken)) throw playQuizNotFound()
    const quiz = await deps.quizzes.findByShareToken(shareToken)
    if (quiz !== null) return toPlayQuizResponse(quiz, deps.imageUrl)
    const matching = await deps.matchings.findByShareToken(shareToken)
    if (matching !== null) return toPlayMatchingResponse(matching, deps.shuffle)
    const trueFalse = await deps.trueFalses.findByShareToken(shareToken)
    if (trueFalse !== null) return toPlayTrueFalseResponse(trueFalse)
    throw playQuizNotFound()
  }
}
