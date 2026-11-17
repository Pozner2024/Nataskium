import { describe, expect, it, vi } from 'vitest'
import {
  type LibraryCreateMatchingCopy,
  type LibraryQuizCopyRow,
  type LibraryQuizRow,
  type LibraryRepository,
  makeGetLibraryQuiz,
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

function cardRow(overrides: Partial<LibraryQuizRow> = {}): LibraryQuizRow {
  return {
    number: NUMBER,
    type: UNKNOWN_TYPE as LibraryQuizRow['type'],
    title: SECRET_TITLE,
    groupSlug: 'other',
    graded: true,
    questions: PAIR_SHAPED_QUESTIONS,
    createdAt: new Date('2026-11-16T10:00:00.000Z'),
    ...overrides,
  }
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
    questions: PAIR_SHAPED_QUESTIONS,
    ...overrides,
  }
}

describe('библиотека: строка с неизвестным type', () => {
  it('карточка: внутренняя ошибка (не AppError, значит 500), текст строки в сообщении не появляется', async () => {
    const library = { findByNumber: vi.fn(async () => cardRow()) } as unknown as LibraryRepository
    const getLibraryQuiz = makeGetLibraryQuiz({ library, imageUrl: () => null, shuffle: (items) => [...items] })

    const error = await errorOf(getLibraryQuiz(NUMBER))

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(AppError)
    expect((error as Error).message).not.toContain(SECRET_TITLE)
    expect((error as Error).message).not.toContain('кот')
  })

  it('«Взять себе»: внутренняя ошибка, копия не создаётся, текст строки в сообщении не появляется', async () => {
    const library = { findForCopy: vi.fn(async () => copySourceRow()) } as unknown as LibraryRepository
    const createQuiz = vi.fn(async () => ({ id: 'copy-id' }))
    const createMatching: LibraryCreateMatchingCopy = vi.fn(async () => ({ id: 'copy-matching-id' }))
    const take = makeTakeLibraryQuiz({
      library,
      countQuizzes: async () => 0,
      imageCopier: null,
      createQuiz,
      createMatching,
    })

    const error = await errorOf(take('teacher-a', NUMBER))

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(AppError)
    expect((error as Error).message).not.toContain(SECRET_TITLE)
    expect(createQuiz).not.toHaveBeenCalled()
    expect(createMatching).not.toHaveBeenCalled()
  })
})
