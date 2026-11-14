import { randomUUID } from 'node:crypto'
import type { QuizRepository, StoredQuiz } from '../../src/features/quizzes'

type FakeRecord = { teacherId: string; deletedAt: Date | null; quiz: StoredQuiz }

export function makeFakeQuizRepository(takenTokens: string[] = []) {
  const records: FakeRecord[] = []
  const usedTokens = new Set(takenTokens)
  const alive = (id: string, teacherId: string) =>
    records.find((r) => r.quiz.id === id && r.teacherId === teacherId && r.deletedAt === null)

  const repository: QuizRepository = {
    async listByTeacher(teacherId) {
      return records.filter((r) => r.teacherId === teacherId && r.deletedAt === null).map((r) => r.quiz)
    },
    async countByTeacher(teacherId) {
      return records.filter((r) => r.teacherId === teacherId && r.deletedAt === null).length
    },
    async findOwned(id, teacherId) {
      return alive(id, teacherId)?.quiz ?? null
    },
    async create(teacherId, input, shareToken) {
      if (usedTokens.has(shareToken)) return null
      usedTokens.add(shareToken)
      const quiz = { ...input, id: randomUUID(), shareToken, updatedAt: new Date() }
      records.push({ teacherId, deletedAt: null, quiz })
      return quiz
    },
    async updateOwned(id, teacherId, input) {
      const record = alive(id, teacherId)
      if (record === undefined) return false
      record.quiz = { ...record.quiz, ...input, updatedAt: new Date() }
      return true
    },
    async softDeleteOwned(id, teacherId) {
      const record = alive(id, teacherId)
      if (record === undefined) return false
      record.deletedAt = new Date()
      return true
    },
    async findByShareToken(token) {
      return records.find((r) => r.quiz.shareToken === token && r.deletedAt === null)?.quiz ?? null
    },
  }
  return repository
}
