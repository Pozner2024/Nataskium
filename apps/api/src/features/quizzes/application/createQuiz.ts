import { randomBytes } from 'node:crypto'
import { MAX_QUIZZES_PER_TEACHER, type QuizInput } from '@nataskium/shared/schemas'
import { type AppError, UnauthorizedError } from '../../../shared/errors'
import { collectImageIds, syncQuizImages } from './quizImages'
import { quizLimitReached, unknownGroup } from './quizErrors'
import type { QuizWriteDeps, StoredQuiz } from '../types'

// 16 байт → 22 символа base64url без '=': формат shareTokenSchema
const SHARE_TOKEN_BYTES = 16
const CREATE_ATTEMPTS = 2

export type CreateQuizDeps = QuizWriteDeps & {
  generateShareToken?: () => string
}

// По умолчанию задание публикуется в библиотеку; копия из библиотеки создаётся непубличной
export type CreateQuizOptions = { isPublic?: boolean }

// Занятый shareToken и отсутствующая ссылка обрывают транзакцию в Postgres: попытка откатывается целиком,
// следующая — в новой транзакции, а причину отсутствующей ссылки можно выяснить только после отката
class ShareTokenTaken extends Error {}
class ReferenceMissing extends Error {}

function randomShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString('base64url')
}

export function makeCreateQuiz(deps: CreateQuizDeps) {
  const generateShareToken = deps.generateShareToken ?? randomShareToken

  async function createOnce(
    teacherId: string,
    input: QuizInput,
    imageIds: string[],
    isPublic: boolean,
  ): Promise<StoredQuiz | null | 'referenceMissing'> {
    try {
      return await deps.transaction(async ({ quizzes, images }) => {
        const quiz = await quizzes.create(teacherId, input, generateShareToken(), isPublic)
        if (quiz === null) throw new ShareTokenTaken()
        if (quiz === 'referenceMissing') throw new ReferenceMissing()
        // У новой викторины отвязывать нечего
        await syncQuizImages(images, quiz.id, teacherId, imageIds)
        return quiz
      })
    } catch (error) {
      if (error instanceof ShareTokenTaken) return null
      if (error instanceof ReferenceMissing) return 'referenceMissing'
      throw error
    }
  }

  // Внешних ключей два: группа и учитель. Группа на месте — значит, аккаунт удалён при ещё действующем access-токене:
  // тот же 401, что и у requireAuth
  async function referenceMissingError(input: QuizInput): Promise<AppError> {
    if (!(await deps.quizzes.groupExists(input.group))) return unknownGroup()
    return new UnauthorizedError()
  }

  return async function createQuiz(teacherId: string, input: QuizInput, options: CreateQuizOptions = {}): Promise<StoredQuiz> {
    const isPublic = options.isPublic ?? true
    const imageIds = collectImageIds(input, deps.imageFiles)
    if (!(await deps.quizzes.groupExists(input.group))) throw unknownGroup()
    // Гонку двух параллельных созданий на последней викторине не закрываем: лимит мягкий
    if ((await deps.quizzes.countByTeacher(teacherId)) >= MAX_QUIZZES_PER_TEACHER) throw quizLimitReached()
    for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
      const quiz = await createOnce(teacherId, input, imageIds, isPublic)
      if (quiz === 'referenceMissing') throw await referenceMissingError(input)
      if (quiz !== null) return quiz
    }
    throw new Error('Could not generate a unique share token')
  }
}
