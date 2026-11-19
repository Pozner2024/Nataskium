import { LIBRARY_PREVIEW_QUESTIONS, MATCHING_ACTIVITY, TRUE_FALSE_ACTIVITY, type LibraryQuizResponse } from '@nataskium/shared/schemas'
import type { LibraryImageUrl, LibraryQuizRow, LibraryRepository, LibraryShuffle } from '../types'
import { libraryNotFound } from './libraryErrors'
import { parsePairs, parseQuestions, parseTrueFalseItems, toLibrarySummary } from './toLibrarySummary'

type GetLibraryQuizDeps = { library: LibraryRepository; imageUrl: LibraryImageUrl; shuffle: LibraryShuffle }

// Все определения по порядку и все слова, перемешанные заново на каждый запрос: ровно то же, что отдаёт игра.
// Показ части пар выдал бы по набору слов, какие из них относятся к скрытым определениям (ADR-0013)
function toMatchingCard(row: LibraryQuizRow, shuffle: LibraryShuffle): LibraryQuizResponse {
  const pairs = parsePairs(row)
  return {
    quiz: {
      ...toLibrarySummary(row, pairs.length),
      type: MATCHING_ACTIVITY,
      definitions: pairs.map((pair) => pair.definition),
      terms: shuffle(pairs.map((pair) => pair.term)),
    },
  }
}

// Только тексты утверждений: правильные ответы публично не показываются
function toTrueFalseCard(row: LibraryQuizRow): LibraryQuizResponse {
  const items = parseTrueFalseItems(row)
  return {
    quiz: {
      ...toLibrarySummary(row, items.length),
      type: TRUE_FALSE_ACTIVITY,
      statements: items.map((item) => item.statement),
    },
  }
}

export function makeGetLibraryQuiz(deps: GetLibraryQuizDeps) {
  const urlOf = (imageId: string | null) => (imageId === null ? null : deps.imageUrl(imageId))

  return async function getLibraryQuiz(number: number): Promise<LibraryQuizResponse> {
    const row = await deps.library.findByNumber(number)
    if (row === null) throw libraryNotFound()
    if (row.type === MATCHING_ACTIVITY) return toMatchingCard(row, deps.shuffle)
    if (row.type === TRUE_FALSE_ACTIVITY) return toTrueFalseCard(row)
    const questions = parseQuestions(row)
    // Поля собираются явно: isCorrect и число верных не должны попасть в публичный ответ ни при каких правках модели
    return {
      quiz: {
        ...toLibrarySummary(row, questions.length),
        type: 'quiz',
        questions: questions.slice(0, LIBRARY_PREVIEW_QUESTIONS).map((question) => ({
          text: question.text,
          imageUrl: urlOf(question.imageId),
          options: question.options.map((option) => ({ text: option.text, imageUrl: urlOf(option.imageId) })),
        })),
      },
    }
  }
}
