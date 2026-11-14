import { randomBytes } from 'node:crypto'
import { MAX_QUIZZES_PER_TEACHER, type QuizInput } from '@nataskium/shared/schemas'
import { quizLimitReached } from './quizErrors'
import type { QuizRepository, StoredQuiz } from '../types'

// 16 байт → 22 символа base64url без '=': формат shareTokenSchema
const SHARE_TOKEN_BYTES = 16
const CREATE_ATTEMPTS = 2

export type CreateQuizDeps = {
  quizzes: QuizRepository
  generateShareToken?: () => string
}

function randomShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString('base64url')
}

export function makeCreateQuiz(deps: CreateQuizDeps) {
  const generateShareToken = deps.generateShareToken ?? randomShareToken

  return async function createQuiz(teacherId: string, input: QuizInput): Promise<StoredQuiz> {
    // Гонку двух параллельных созданий на последней викторине не закрываем: лимит мягкий
    if ((await deps.quizzes.countByTeacher(teacherId)) >= MAX_QUIZZES_PER_TEACHER) throw quizLimitReached()
    for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
      const quiz = await deps.quizzes.create(teacherId, input, generateShareToken())
      if (quiz !== null) return quiz
    }
    throw new Error('Could not generate a unique share token')
  }
}
