import { MAX_ACTIVITIES_PER_TEACHER } from '@nataskium/shared/schemas'
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

const TEACHER = 'teacher-a'
const NUMBER = 7
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
const PAIRS = [
  { term: 'кот', definition: 'мяукает' },
  { term: 'пёс', definition: 'лает' },
  { term: 'корова', definition: 'мычит' },
  { term: 'утка', definition: 'крякает' },
  { term: 'конь', definition: 'ржёт' },
  { term: 'овца', definition: 'блеет' },
]

function copyRow(overrides: Partial<LibraryQuizCopyRow> = {}): LibraryQuizCopyRow {
  return {
    type: 'matching',
    title: 'Животные',
    showAnswers: false,
    gradingScale: 'five',
    groupSlug: 'other',
    timerMode: 'limit',
    timeLimitSeconds: 600,
    questions: PAIRS,
    ...overrides,
  }
}

function setupTake(options: { row?: LibraryQuizCopyRow | null; count?: number } = {}) {
  const library = { findForCopy: vi.fn(async () => (options.row === undefined ? copyRow() : options.row)) } as unknown as LibraryRepository
  const createQuiz = vi.fn(async () => ({ id: 'new-quiz-id' }))
  const createMatching: LibraryCreateMatchingCopy = vi.fn(async () => ({ id: 'new-matching-id' }))
  const take = makeTakeLibraryQuiz({ library, countQuizzes: async () => options.count ?? 0, imageCopier: null, createQuiz, createMatching })
  return { take, createQuiz, createMatching }
}

async function statusOf(promise: Promise<unknown>): Promise<number | null> {
  const error = await promise.then(() => null, (e: unknown) => e)
  return error instanceof AppError ? error.status : null
}

describe('takeLibraryQuiz: сопоставление', () => {
  it('копия через createMatching с isPublic: false, содержимое и настройки те же; ответ с type matching', async () => {
    const { take, createQuiz, createMatching } = setupTake()

    expect(await take(TEACHER, NUMBER)).toEqual({ quizId: 'new-matching-id', type: 'matching' })
    expect(createMatching).toHaveBeenCalledWith(
      TEACHER,
      { title: 'Животные', showAnswers: false, gradingScale: 'five', group: 'other', timer: { mode: 'limit', seconds: 600 }, pairs: PAIRS },
      { isPublic: false },
    )
    expect(createQuiz).not.toHaveBeenCalled()
  })

  it('картинки не нужны: хранилище не настроено, копия всё равно создаётся', async () => {
    const { take } = setupTake()

    await expect(take(TEACHER, NUMBER)).resolves.toMatchObject({ type: 'matching' })
  })

  it(`лимит общий: при ${MAX_ACTIVITIES_PER_TEACHER} заданиях — 409, копия не создаётся`, async () => {
    const { take, createMatching } = setupTake({ count: MAX_ACTIVITIES_PER_TEACHER })

    expect(await statusOf(take(TEACHER, NUMBER))).toBe(CONFLICT_STATUS)
    expect(createMatching).not.toHaveBeenCalled()
  })

  it('нет публичного задания (в том числе удалён автор) — 404', async () => {
    const { take, createMatching } = setupTake({ row: null })

    expect(await statusOf(take(TEACHER, NUMBER))).toBe(NOT_FOUND_STATUS)
    expect(createMatching).not.toHaveBeenCalled()
  })

  it('строка, не прошедшая схему, — внутренняя ошибка, а не копия', async () => {
    const { take, createMatching } = setupTake({ row: copyRow({ questions: [PAIRS[0], PAIRS[0]] }) })

    await expect(take(TEACHER, NUMBER)).rejects.toThrow('does not match the matching schema')
    expect(createMatching).not.toHaveBeenCalled()
  })
})

describe('getLibraryQuiz: карточка сопоставления', () => {
  const ROW: LibraryQuizRow = {
    number: NUMBER,
    type: 'matching',
    title: 'Животные',
    groupSlug: 'other',
    graded: true,
    createdAt: new Date('2026-11-16T10:00:00.000Z'),
    questions: PAIRS,
  }
  const reverse = <T,>(items: readonly T[]): T[] => [...items].reverse()

  function getCard(shuffle = reverse) {
    const library = { findByNumber: async () => ROW } as unknown as LibraryRepository
    return makeGetLibraryQuiz({ library, imageUrl: () => null, shuffle })(NUMBER)
  }

  it('все определения по порядку и все слова в порядке shuffle — без ограничения в 5', async () => {
    expect(await getCard()).toEqual({
      quiz: {
        number: NUMBER,
        type: 'matching',
        title: 'Животные',
        groupSlug: 'other',
        questionCount: PAIRS.length,
        graded: true,
        createdAt: '2026-11-16T10:00:00.000Z',
        definitions: PAIRS.map((pair) => pair.definition),
        terms: PAIRS.map((pair) => pair.term).reverse(),
      },
    })
  })

  it('no-leak: нет пар, правильных ответов и шкалы; слова — мультимножество слов задания', async () => {
    const card = await getCard((items) => [...items])
    const body = JSON.stringify(card)

    for (const leak of ['pairs', 'correct', 'gradingScale', 'term"', 'definition"', 'questions']) expect(body).not.toContain(leak)
    if (card.quiz.type !== 'matching') throw new Error('expected matching')
    expect([...card.quiz.terms].sort()).toEqual(PAIRS.map((pair) => pair.term).sort())
  })
})
