import { randomUUID } from 'node:crypto'
import { MAX_QUIZZES_PER_TEACHER, type QuizInput } from '@nataskium/shared/schemas'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type LibraryCreateCopy, type LibraryCreateMatchingCopy, type LibraryImageCopier, type LibraryQuizCopyRow, type LibraryRepository, makeTakeLibraryQuiz } from '../src/features/library'
import { AppError, ExternalServiceError } from '../src/shared/errors'

const NUMBER = 7
const TEACHER = randomUUID()
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
const SERVICE_UNAVAILABLE_STATUS = 503
const COPY_CONCURRENCY = 4
const MANY_IMAGES = 12

const IMAGE_Q = randomUUID()
const IMAGE_A = randomUUID()
const IMAGE_B = randomUUID()

function row(overrides: Partial<LibraryQuizCopyRow> = {}): LibraryQuizCopyRow {
  return {
    type: 'quiz',
    title: 'Столицы',
    showAnswers: true,
    gradingScale: 'five',
    groupSlug: 'other',
    timerMode: 'none',
    timeLimitSeconds: null,
    questions: [
      {
        text: 'Столица Франции?',
        imageId: IMAGE_Q,
        options: [
          { text: 'Париж', isCorrect: true, imageId: IMAGE_A },
          { text: 'Рим', isCorrect: false, imageId: IMAGE_B },
        ],
      },
    ],
    ...overrides,
  }
}

function questionsWithImages(count: number): LibraryQuizCopyRow['questions'] {
  return Array.from({ length: count }, () => ({
    text: 'Вопрос',
    imageId: randomUUID(),
    options: [
      { text: 'Да', isCorrect: true, imageId: null },
      { text: 'Нет', isCorrect: false, imageId: null },
    ],
  }))
}

// teacherGone — строка картинки не записывается: учителя удалили при действующем токене
type Setup = { source?: LibraryQuizCopyRow | null; count?: number; withCopier?: boolean; failCopyOn?: (from: string) => boolean; teacherGone?: boolean }

function setup({ source = row(), count = 0, withCopier = true, failCopyOn, teacherGone = false }: Setup = {}) {
  const log: string[] = []
  const copies: { from: string; to: string }[] = []
  const rows: { id: string; teacherId: string }[] = []
  const removedFiles: string[] = []
  const deletedRows: string[] = []
  const created: { teacherId: string; input: QuizInput; options: { isPublic: boolean } }[] = []
  let active = 0
  let maxActive = 0

  const library = {
    findForCopy: vi.fn(async (): Promise<LibraryQuizCopyRow | null> => source),
  } as unknown as LibraryRepository

  const imageCopier: LibraryImageCopier = {
    async copyFile(from, to) {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      if (failCopyOn?.(from) === true) throw new ExternalServiceError('memory-storage', 500)
      log.push('copyFile')
      copies.push({ from, to })
    },
    async createRow(id, teacherId) {
      log.push('createRow')
      if (teacherGone) return false
      rows.push({ id, teacherId })
      return true
    },
    async deleteRows(ids) {
      log.push('deleteRows')
      deletedRows.push(...ids)
    },
    async removeFiles(ids) {
      log.push('removeFiles')
      removedFiles.push(...ids)
    },
  }

  const createQuiz: LibraryCreateCopy = vi.fn(async (teacherId, input, options) => {
    created.push({ teacherId, input, options })
    return { id: 'new-quiz-id' }
  })

  const createMatching: LibraryCreateMatchingCopy = vi.fn(async () => ({ id: 'new-matching-id' }))

  const take = makeTakeLibraryQuiz({
    library,
    countQuizzes: async () => count,
    imageCopier: withCopier ? imageCopier : null,
    createQuiz,
    createMatching,
  })
  return { take, library, createQuiz, createMatching, copies, rows, removedFiles, deletedRows, created, log, maxActive: () => maxActive }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected rejection')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('takeLibraryQuiz (use-case)', () => {
  it('копия создаётся с isPublic=false; ответ — id нового задания', async () => {
    const s = setup()
    expect(await s.take(TEACHER, NUMBER)).toEqual({ quizId: 'new-quiz-id', type: 'quiz' })
    expect(s.created).toHaveLength(1)
    expect(s.created[0]).toMatchObject({ teacherId: TEACHER, options: { isPublic: false } })
    expect(s.created[0]!.input).toMatchObject({ title: 'Столицы', showAnswers: true, gradingScale: 'five', group: 'other' })
  })

  it('таймер копируется: limit с секундами, stopwatch и none', async () => {
    const cases = [
      [{ timerMode: 'limit', timeLimitSeconds: 900 }, { mode: 'limit', seconds: 900 }],
      [{ timerMode: 'stopwatch', timeLimitSeconds: null }, { mode: 'stopwatch' }],
      [{ timerMode: 'none', timeLimitSeconds: null }, { mode: 'none' }],
    ] as const
    for (const [columns, timer] of cases) {
      const s = setup({ source: row(columns) })
      await s.take(TEACHER, NUMBER)
      expect(s.created[0]!.input.timer).toEqual(timer)
    }
  })

  it('недопустимая комбинация колонок таймера → внутренняя ошибка, ничего не создано', async () => {
    const s = setup({ source: row({ timerMode: 'limit', timeLimitSeconds: null }) })
    const error = await rejection(s.take(TEACHER, NUMBER))
    expect(error).not.toBeInstanceOf(AppError)
    expect(s.created).toHaveLength(0)
  })

  it('все imageId заменяются новыми и различными; для каждого — копия файла и строка взявшего', async () => {
    const s = setup()
    await s.take(TEACHER, NUMBER)

    const question = s.created[0]!.input.questions[0]!
    const newIds = [question.imageId, ...question.options.map((o) => o.imageId)]
    expect(newIds.every((id) => typeof id === 'string')).toBe(true)
    expect(new Set(newIds).size).toBe(3)
    for (const oldId of [IMAGE_Q, IMAGE_A, IMAGE_B]) expect(newIds).not.toContain(oldId)

    expect(s.copies).toEqual([
      { from: IMAGE_Q, to: question.imageId },
      { from: IMAGE_A, to: question.options[0]!.imageId },
      { from: IMAGE_B, to: question.options[1]!.imageId },
    ])
    expect(s.rows.map((r) => r.id).sort()).toEqual([...(newIds as string[])].sort())
    expect(s.rows.every((r) => r.teacherId === TEACHER)).toBe(true)
  })

  it('строка картинки создаётся после копирования её файла', async () => {
    const s = setup({ source: row({ questions: questionsWithImages(1) }) })
    await s.take(TEACHER, NUMBER)
    expect(s.log).toEqual(['copyFile', 'createRow'])
  })

  it('одна и та же картинка в двух местах получает два разных новых id', async () => {
    const shared = randomUUID()
    const question = {
      text: 'Вопрос',
      imageId: shared,
      options: [
        { text: 'Да', isCorrect: true, imageId: shared },
        { text: 'Нет', isCorrect: false, imageId: null },
      ],
    }
    const s = setup({ source: row({ questions: [question] }) })
    await s.take(TEACHER, NUMBER)
    const copied = s.created[0]!.input.questions[0]!
    expect(copied.imageId).not.toBe(copied.options[0]!.imageId)
    expect(s.copies).toHaveLength(2)
  })

  it('без картинок хранилище не нужно: копия создаётся и при imageCopier = null', async () => {
    const questions = [{ text: 'В?', imageId: null, options: [{ text: 'a', isCorrect: true, imageId: null }, { text: 'b', isCorrect: false, imageId: null }] }]
    const s = setup({ source: row({ questions }), withCopier: false })
    expect(await s.take(TEACHER, NUMBER)).toEqual({ quizId: 'new-quiz-id', type: 'quiz' })
    expect(s.created).toHaveLength(1)
  })

  it('картинки есть, хранилища нет → 503, задание не создано', async () => {
    const s = setup({ withCopier: false })
    const error = await rejection(s.take(TEACHER, NUMBER))
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).status).toBe(SERVICE_UNAVAILABLE_STATUS)
    expect(s.createQuiz).not.toHaveBeenCalled()
  })

  it('источника нет (чужое, скрытое, удалённое, несуществующее) → 404, ничего не копируется', async () => {
    const s = setup({ source: null })
    const error = await rejection(s.take(TEACHER, NUMBER))
    expect((error as AppError).status).toBe(NOT_FOUND_STATUS)
    expect(s.createQuiz).not.toHaveBeenCalled()
    expect(s.copies).toEqual([])
  })

  it('лимит достигнут → 409 до копирования файлов', async () => {
    const s = setup({ count: MAX_QUIZZES_PER_TEACHER })
    const error = await rejection(s.take(TEACHER, NUMBER))
    expect((error as AppError).status).toBe(CONFLICT_STATUS)
    expect(s.copies).toEqual([])
    expect(s.rows).toEqual([])
    expect(s.createQuiz).not.toHaveBeenCalled()
  })

  it('99 заданий — ещё можно взять', async () => {
    const s = setup({ count: MAX_QUIZZES_PER_TEACHER - 1 })
    await expect(s.take(TEACHER, NUMBER)).resolves.toEqual({ quizId: 'new-quiz-id', type: 'quiz' })
  })

  it('сбой копирования файла (ExternalServiceError) → 503; строки удалены раньше файлов; задание не создано', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = setup({ failCopyOn: (from) => from === IMAGE_B })
    const error = await rejection(s.take(TEACHER, NUMBER))
    expect((error as AppError).status).toBe(SERVICE_UNAVAILABLE_STATUS)
    expect(s.createQuiz).not.toHaveBeenCalled()
    expect(s.log.indexOf('deleteRows')).toBeGreaterThan(-1)
    expect(s.log.indexOf('deleteRows')).toBeLessThan(s.log.indexOf('removeFiles'))
    // чистка касается всех новых id, в том числе уже скопированных
    expect(s.deletedRows).toHaveLength(3)
    expect(s.removedFiles).toHaveLength(3)
    for (const id of s.copies.map((c) => c.to)) expect(s.removedFiles).toContain(id)
    for (const oldId of [IMAGE_Q, IMAGE_A, IMAGE_B]) expect(s.removedFiles).not.toContain(oldId)
  })

  it('сбой createQuiz → копии картинок убраны (строки, затем файлы), ошибка пробрасывается', async () => {
    const s = setup()
    const failure = new AppError(CONFLICT_STATUS, 'Quiz limit reached')
    vi.mocked(s.createQuiz).mockRejectedValueOnce(failure)
    expect(await rejection(s.take(TEACHER, NUMBER))).toBe(failure)
    expect(s.deletedRows.sort()).toEqual(s.copies.map((c) => c.to).sort())
    expect(s.removedFiles.sort()).toEqual(s.copies.map((c) => c.to).sort())
    expect(s.log.indexOf('deleteRows')).toBeLessThan(s.log.indexOf('removeFiles'))
  })

  it('неожиданная ошибка (не ExternalServiceError) пробрасывается как есть, не 503', async () => {
    const s = setup()
    const crash = new Error('db down')
    s.take = makeTakeLibraryQuiz({
      library: { findForCopy: async () => row() } as unknown as LibraryRepository,
      countQuizzes: async () => 0,
      imageCopier: {
        async copyFile() {},
        async createRow() {
          throw crash
        },
        async deleteRows() {},
        async removeFiles() {},
      },
      createQuiz: s.createQuiz,
      createMatching: s.createMatching,
    })
    expect(await rejection(s.take(TEACHER, NUMBER))).toBe(crash)
  })

  it('сбой самой чистки не маскирует исходную ошибку', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('create failed')
    const take = makeTakeLibraryQuiz({
      library: { findForCopy: async () => row() } as unknown as LibraryRepository,
      countQuizzes: async () => 0,
      imageCopier: {
        async copyFile() {},
        async createRow() {
          return true
        },
        async deleteRows() {
          throw new Error('cleanup failed')
        },
        async removeFiles() {},
      },
      createMatching: async () => ({ id: 'new-matching-id' }),
      createQuiz: async () => {
        throw failure
      },
    })
    expect(await rejection(take(TEACHER, NUMBER))).toBe(failure)
  })

  it('копирование идёт не более чем в 4 потока', async () => {
    const s = setup({ source: row({ questions: questionsWithImages(MANY_IMAGES) }) })
    await s.take(TEACHER, NUMBER)
    expect(s.copies).toHaveLength(MANY_IMAGES)
    expect(s.maxActive()).toBeGreaterThan(1)
    expect(s.maxActive()).toBeLessThanOrEqual(COPY_CONCURRENCY)
  })

  it('после первого сбоя новые файлы не берутся в работу', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const questions = questionsWithImages(MANY_IMAGES * 4)
    const s = setup({ source: row({ questions }), failCopyOn: () => true })
    await rejection(s.take(TEACHER, NUMBER))
    expect(s.copies).toEqual([])
    expect(s.createQuiz).not.toHaveBeenCalled()
  })

  it('источник не проходит схему → внутренняя ошибка (не 404 и не AppError), ничего не копируется', async () => {
    const s = setup({ source: row({ title: '' }) })
    const error = await rejection(s.take(TEACHER, NUMBER))
    expect(error).not.toBeInstanceOf(AppError)
    expect(s.copies).toEqual([])
    expect(s.createQuiz).not.toHaveBeenCalled()
  })

  it('findForCopy вызывается с номером', async () => {
    const s = setup()
    await s.take(TEACHER, NUMBER)
    expect(s.library.findForCopy).toHaveBeenCalledWith(NUMBER)
  })

  it('учителя уже нет (строка картинки не записана) → 401 как у requireAuth; задание не создано, копии убраны, новые не начинаются', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = setup({ source: row({ questions: questionsWithImages(MANY_IMAGES) }), teacherGone: true })

    const error = await rejection(s.take(TEACHER, NUMBER))

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ status: 401, message: 'Unauthorized', headers: { 'WWW-Authenticate': 'Bearer' } })
    expect(s.createQuiz).not.toHaveBeenCalled()
    expect(s.copies.length).toBeLessThanOrEqual(COPY_CONCURRENCY)
    for (const id of s.copies.map((c) => c.to)) expect(s.removedFiles).toContain(id)
    expect(errorLog).not.toHaveBeenCalled()
  })
})
