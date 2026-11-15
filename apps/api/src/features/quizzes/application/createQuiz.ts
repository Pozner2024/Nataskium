import { randomBytes } from 'node:crypto'
import { MAX_QUIZZES_PER_TEACHER, type QuizInput } from '@nataskium/shared/schemas'
import { collectImageIds, syncQuizImages } from './quizImages'
import { quizLimitReached, unknownGroup } from './quizErrors'
import type { QuizWriteDeps, StoredQuiz } from '../types'

// 16 байт → 22 символа base64url без '=': формат shareTokenSchema
const SHARE_TOKEN_BYTES = 16
const CREATE_ATTEMPTS = 2

export type CreateQuizDeps = QuizWriteDeps & {
  generateShareToken?: () => string
}

// Занятый shareToken обрывает транзакцию в Postgres: попытка откатывается целиком, следующая — в новой транзакции
class ShareTokenTaken extends Error {}

function randomShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString('base64url')
}

export function makeCreateQuiz(deps: CreateQuizDeps) {
  const generateShareToken = deps.generateShareToken ?? randomShareToken

  async function createOnce(teacherId: string, input: QuizInput, imageIds: string[]): Promise<StoredQuiz | null> {
    try {
      return await deps.transaction(async ({ quizzes, images }) => {
        const quiz = await quizzes.create(teacherId, input, generateShareToken())
        if (quiz === null) throw new ShareTokenTaken()
        // У новой викторины отвязывать нечего
        await syncQuizImages(images, quiz.id, teacherId, imageIds)
        return quiz
      })
    } catch (error) {
      if (error instanceof ShareTokenTaken) return null
      throw error
    }
  }

  return async function createQuiz(teacherId: string, input: QuizInput): Promise<StoredQuiz> {
    const imageIds = collectImageIds(input, deps.imageFiles)
    if (!(await deps.quizzes.groupExists(input.group))) throw unknownGroup()
    // Гонку двух параллельных созданий на последней викторине не закрываем: лимит мягкий
    if ((await deps.quizzes.countByTeacher(teacherId)) >= MAX_QUIZZES_PER_TEACHER) throw quizLimitReached()
    for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
      const quiz = await createOnce(teacherId, input, imageIds)
      if (quiz !== null) return quiz
    }
    throw new Error('Could not generate a unique share token')
  }
}
