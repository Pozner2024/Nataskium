import { MAX_ACTIVITIES_PER_TEACHER } from '@nataskium/shared/schemas'
import { describe, expect, it, vi } from 'vitest'
import {
  type LibraryCreateTrueFalseCopy,
  type LibraryQuizCopyRow,
  type LibraryRepository,
  makeTakeLibraryQuiz,
} from '../src/features/library'
import { AppError } from '../src/shared/errors'

const TEACHER = 'teacher-a'
const NUMBER = 7
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
const ITEMS = [
  { statement: 'Земля круглая', answer: true },
  { statement: 'Солнце холодное', answer: false },
  { statement: 'Вода мокрая', answer: true },
]

function copyRow(overrides: Partial<LibraryQuizCopyRow> = {}): LibraryQuizCopyRow {
  return {
    type: 'truefalse',
    title: 'Факты',
    showAnswers: true,
    gradingScale: 'five',
    groupSlug: 'other',
    timerMode: 'limit',
    timeLimitSeconds: 300,
    introTheme: 'nataskium-day',
    questions: ITEMS,
    ...overrides,
  }
}

function setupTake(options: { row?: LibraryQuizCopyRow | null; count?: number } = {}) {
  const library = { findForCopy: vi.fn(async () => (options.row === undefined ? copyRow() : options.row)) } as unknown as LibraryRepository
  const createQuiz = vi.fn(async () => ({ id: 'new-quiz-id' }))
  const createMatching = vi.fn(async () => ({ id: 'new-matching-id' }))
  const createTrueFalse: LibraryCreateTrueFalseCopy = vi.fn(async () => ({ id: 'new-truefalse-id' }))
  const take = makeTakeLibraryQuiz({ library, countQuizzes: async () => options.count ?? 0, imageCopier: null, createQuiz, createMatching, createTrueFalse })
  return { take, createQuiz, createMatching, createTrueFalse }
}

async function statusOf(promise: Promise<unknown>): Promise<number | null> {
  const error = await promise.then(() => null, (e: unknown) => e)
  return error instanceof AppError ? error.status : null
}

describe('takeLibraryQuiz: да/нет', () => {
  it('копия через createTrueFalse с isPublic: false, утверждения с ответами и настройки те же; ответ с type truefalse', async () => {
    const { take, createQuiz, createMatching, createTrueFalse } = setupTake()

    expect(await take(TEACHER, NUMBER)).toEqual({ quizId: 'new-truefalse-id', type: 'truefalse' })
    expect(createTrueFalse).toHaveBeenCalledWith(
      TEACHER,
      { title: 'Факты', showAnswers: true, gradingScale: 'five', group: 'other', timer: { mode: 'limit', seconds: 300 }, introTheme: 'nataskium-day', items: ITEMS },
      { isPublic: false },
    )
    expect(createQuiz).not.toHaveBeenCalled()
    expect(createMatching).not.toHaveBeenCalled()
  })

  it(`лимит общий: при ${MAX_ACTIVITIES_PER_TEACHER} заданиях — 409, копия не создаётся`, async () => {
    const { take, createTrueFalse } = setupTake({ count: MAX_ACTIVITIES_PER_TEACHER })

    expect(await statusOf(take(TEACHER, NUMBER))).toBe(CONFLICT_STATUS)
    expect(createTrueFalse).not.toHaveBeenCalled()
  })

  it('нет публичного задания — 404', async () => {
    const { take, createTrueFalse } = setupTake({ row: null })

    expect(await statusOf(take(TEACHER, NUMBER))).toBe(NOT_FOUND_STATUS)
    expect(createTrueFalse).not.toHaveBeenCalled()
  })

  it('строка, не прошедшая схему, — внутренняя ошибка, а не копия', async () => {
    const { take, createTrueFalse } = setupTake({ row: copyRow({ questions: [ITEMS[0], ITEMS[0]] }) })

    await expect(take(TEACHER, NUMBER)).rejects.toThrow('does not match the true-false schema')
    expect(createTrueFalse).not.toHaveBeenCalled()
  })

  it('неизвестный визуальный стиль в строке — внутренняя ошибка, а не копия со стилем по умолчанию', async () => {
    const { take, createTrueFalse } = setupTake({ row: copyRow({ introTheme: 'neon' }) })

    await expect(take(TEACHER, NUMBER)).rejects.toThrow('does not match the true-false schema')
    expect(createTrueFalse).not.toHaveBeenCalled()
  })
})
