import { randomUUID } from 'node:crypto'
import type { QuizImageFiles, QuizImageLinks, QuizRepository, QuizTransaction, StoredQuiz } from '../../src/features/quizzes'

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

type FakeImageRow = { teacherId: string; quizId: string | null }

// Картинки в памяти: attach/detachMissing — с теми же условиями, что в репозитории quiz-images.
// Отката нет: состояние после ошибки внутри транзакции проверяют интеграционные тесты
export function makeFakeQuizImages() {
  const rows = new Map<string, FakeImageRow>()
  const removedFiles: string[] = []
  const failing = { removeFiles: false }

  const links: QuizImageLinks = {
    async attach(quizId, teacherId, ids) {
      const free = ids.filter((id) => {
        const row = rows.get(id)
        return row !== undefined && row.teacherId === teacherId && (row.quizId === null || row.quizId === quizId)
      })
      for (const id of free) rows.set(id, { teacherId, quizId })
      return free.length
    },
    async detachMissing(quizId, teacherId, keepIds) {
      const detached = [...rows].filter(([id, row]) => row.quizId === quizId && row.teacherId === teacherId && !keepIds.includes(id))
      for (const [id, row] of detached) rows.set(id, { ...row, quizId: null })
      return detached.map(([id]) => id)
    },
  }

  const files: QuizImageFiles = {
    publicUrl: (imageId) => `https://images.example.test/quiz-images/${imageId}.webp`,
    async removeFiles(imageIds) {
      if (failing.removeFiles) throw new Error('storage is down')
      removedFiles.push(...imageIds)
    },
    async deleteDetached(imageIds) {
      const detached = imageIds.filter((id) => rows.get(id)?.quizId === null)
      for (const id of detached) rows.delete(id)
      return detached
    },
  }

  return { links, files, rows, removedFiles, failing }
}

export function makeFakeQuizTransaction(quizzes: QuizRepository, images: QuizImageLinks): QuizTransaction {
  return (work) => work({ quizzes, images })
}
