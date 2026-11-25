import { describe, expect, it, vi } from 'vitest'
import {
  type LibraryCreateMatchingCopy,
  type LibraryQuizCopyRow,
  type LibraryRepository,
  makeTakeLibraryQuiz,
} from '../src/features/library'
import { AppError } from '../src/shared/errors'

// Тип вне ACTIVITY_KINDS — рассинхрон данных и кода: внутренняя ошибка, а текст строки в неё не попадает
const UNKNOWN_TYPE = 'poll'
const SECRET_TITLE = 'СЕКРЕТНЫЙ-ЗАГОЛОВОК-7f3a'
const PAIR_SHAPED_QUESTIONS = [
  { term: 'кот', definition: 'мяукает' },
  { term: 'пёс', definition: 'лает' },
]
const NUMBER = 7

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => null, (error: unknown) => error)
}

function copySourceRow(overrides: Partial<LibraryQuizCopyRow> = {}): LibraryQuizCopyRow {
  return {
    type: UNKNOWN_TYPE as LibraryQuizCopyRow['type'],
    title: SECRET_TITLE,
    showAnswers: false,
    gradingScale: 'five',
    groupSlug: 'other',
    timerMode: 'none',
    timeLimitSeconds: null,
    introTheme: 'nataskium-night',
    questions: PAIR_SHAPED_QUESTIONS,
    ...overrides,
  }
}

describe('библиотека: строка с неизвестным type', () => {
  it('«Взять себе»: внутренняя ошибка, копия не создаётся, текст строки в сообщении не появляется', async () => {
    const library = { findForCopy: vi.fn(async () => copySourceRow()) } as unknown as LibraryRepository
    const createQuiz = vi.fn(async () => ({ id: 'copy-id' }))
    const createMatching: LibraryCreateMatchingCopy = vi.fn(async () => ({ id: 'copy-matching-id' }))
    const createTrueFalse = vi.fn(async () => ({ id: 'new-truefalse-id' }))
    const take = makeTakeLibraryQuiz({
      library,
      countQuizzes: async () => 0,
      imageCopier: null,
      createQuiz,
      createMatching,
      createTrueFalse,
    })

    const error = await errorOf(take('teacher-a', NUMBER))

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(AppError)
    expect((error as Error).message).not.toContain(SECRET_TITLE)
    expect(createQuiz).not.toHaveBeenCalled()
    expect(createMatching).not.toHaveBeenCalled()
    expect(createTrueFalse).not.toHaveBeenCalled()
  })
})
