import { randomUUID } from 'node:crypto'
import {
  MATCHING_ACTIVITY,
  MAX_QUIZZES_PER_TEACHER,
  type LibraryTakeResponse,
  type MatchingInput,
  type QuizInput,
  matchingInputSchema,
  quizInputSchema,
  timerFromColumns,
} from '@nataskium/shared/schemas'
import { ExternalServiceError, UnauthorizedError } from '../../../shared/errors'
import type { LibraryCreateCopy, LibraryCreateMatchingCopy, LibraryImageCopier, LibraryQuizCopyRow, LibraryRepository } from '../types'
import { imageStorageUnavailable, libraryNotFound, quizLimitReached } from './libraryErrors'

// Не открываем сотни запросов к хранилищу разом: у задания бывает до ~350 картинок
const COPY_CONCURRENCY = 4

export type TakeLibraryQuizDeps = {
  library: LibraryRepository
  countQuizzes: (teacherId: string) => Promise<number>
  // null — хранилище не настроено
  imageCopier: LibraryImageCopier | null
  createQuiz: LibraryCreateCopy
  createMatching: LibraryCreateMatchingCopy
  generateId?: () => string
}

type ImagePair = { from: string; to: string }

// Строка, не прошедшая схему, — рассинхрон данных и кода: внутренняя ошибка (500), а не ошибка клиента
function parseCopySource(number: number, row: LibraryQuizCopyRow): QuizInput {
  const parsed = quizInputSchema.safeParse({
    title: row.title,
    showAnswers: row.showAnswers,
    gradingScale: row.gradingScale,
    group: row.groupSlug,
    timer: timerFromColumns(row.timerMode, row.timeLimitSeconds),
    questions: row.questions,
  })
  if (!parsed.success) throw new Error(`Library quiz ${number} does not match the quiz schema`)
  return parsed.data
}

function parseMatchingCopySource(number: number, row: LibraryQuizCopyRow): MatchingInput {
  const parsed = matchingInputSchema.safeParse({
    title: row.title,
    showAnswers: row.showAnswers,
    gradingScale: row.gradingScale,
    group: row.groupSlug,
    timer: timerFromColumns(row.timerMode, row.timeLimitSeconds),
    pairs: row.questions,
  })
  if (!parsed.success) throw new Error(`Library matching ${number} does not match the matching schema`)
  return parsed.data
}

// Каждой картинке — новый id: общие id нарушили бы «одна картинка — одно место», а удаление аккаунта автора
// удалило бы файлы у тех, кто взял копию
function remapImages(input: QuizInput, newId: () => string): { input: QuizInput; pairs: ImagePair[] } {
  const pairs: ImagePair[] = []
  const remap = (imageId: string | null): string | null => {
    if (imageId === null) return null
    const to = newId()
    pairs.push({ from: imageId, to })
    return to
  }
  const questions = input.questions.map((question) => ({
    ...question,
    imageId: remap(question.imageId),
    options: question.options.map((option) => ({ ...option, imageId: remap(option.imageId) })),
  }))
  return { input: { ...input, questions }, pairs }
}

// После первой ошибки новые элементы не берутся, но уже начатые дожидаются: иначе чистка шла бы параллельно с копированием
async function forEachLimited<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const failures: unknown[] = []
  const worker = async () => {
    while (failures.length === 0 && next < items.length) {
      const item = items[next]
      next += 1
      if (item === undefined) return
      try {
        await work(item)
      } catch (error) {
        failures.push(error)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  if (failures.length > 0) throw failures[0]
}

async function attemptCleanup(step: () => Promise<void>): Promise<void> {
  try {
    await step()
  } catch (error) {
    console.error('Library copy cleanup failed', error instanceof Error ? error.name : 'unknown')
  }
}

// Строки удаляются раньше файлов: строка без файла хуже файла без строки (его найдёт сверка хранилища).
// Шаги независимы: сбой удаления строк не должен оставлять файлы
async function discardCopies(copier: LibraryImageCopier, imageIds: readonly string[]): Promise<void> {
  if (imageIds.length === 0) return
  await attemptCleanup(() => copier.deleteRows(imageIds))
  await attemptCleanup(() => copier.removeFiles(imageIds))
}

async function copyImages(copier: LibraryImageCopier, teacherId: string, pairs: readonly ImagePair[]): Promise<void> {
  try {
    await forEachLimited(pairs, COPY_CONCURRENCY, async ({ from, to }) => {
      await copier.copyFile(from, to)
      // Сразу, а не на createQuiz: иначе для удалённого аккаунта скопировались бы все файлы задания
      if (!(await copier.createRow(to, teacherId))) throw new UnauthorizedError()
    })
  } catch (error) {
    if (!(error instanceof ExternalServiceError)) throw error
    console.error('ExternalServiceError', error.service, error.status)
    throw imageStorageUnavailable()
  }
}

export function makeTakeLibraryQuiz(deps: TakeLibraryQuizDeps) {
  const generateId = deps.generateId ?? randomUUID

  // Копия не публикуется в библиотеку: системное исключение из автопубликации (ADR-0005)
  async function createCopy(teacherId: string, input: QuizInput): Promise<LibraryTakeResponse> {
    const quiz = await deps.createQuiz(teacherId, input, { isPublic: false })
    return { quizId: quiz.id, type: 'quiz' }
  }

  // Картинок у сопоставления нет: копируется только содержимое. Лимит общий и проверяется ещё раз в createMatching
  async function takeMatching(teacherId: string, number: number, row: LibraryQuizCopyRow): Promise<LibraryTakeResponse> {
    const source = parseMatchingCopySource(number, row)
    if ((await deps.countQuizzes(teacherId)) >= MAX_QUIZZES_PER_TEACHER) throw quizLimitReached()
    const matching = await deps.createMatching(teacherId, source, { isPublic: false })
    return { quizId: matching.id, type: MATCHING_ACTIVITY }
  }

  return async function takeLibraryQuiz(teacherId: string, number: number): Promise<LibraryTakeResponse> {
    const row = await deps.library.findForCopy(number)
    if (row === null) throw libraryNotFound()
    if (row.type === MATCHING_ACTIVITY) return takeMatching(teacherId, number, row)
    const source = parseCopySource(number, row)
    // Раньше копирования файлов: сверх лимита копировать незачем. createQuiz проверит лимит ещё раз
    if ((await deps.countQuizzes(teacherId)) >= MAX_QUIZZES_PER_TEACHER) throw quizLimitReached()

    const { input, pairs } = remapImages(source, generateId)
    const { imageCopier } = deps
    if (pairs.length > 0 && imageCopier === null) throw imageStorageUnavailable()
    if (imageCopier === null) return createCopy(teacherId, input)

    const newIds = pairs.map((pair) => pair.to)
    try {
      await copyImages(imageCopier, teacherId, pairs)
      return await createCopy(teacherId, input)
    } catch (error) {
      await discardCopies(imageCopier, newIds)
      throw error
    }
  }
}
