import { randomUUID } from 'node:crypto'
import type { MatchingRepository, StoredMatching } from '../../src/features/matchings'

// Группы, которые «есть в БД» у фейка
const KNOWN_GROUPS = ['other', 'exact']

type FakeRecord = { teacherId: string; deletedAt: Date | null; isPublic: boolean; matching: StoredMatching }

type FakeOptions = {
  takenTokens?: string[]
  // Неудалённые задания других типов (викторины) у учителя: countByTeacher считает их вместе с сопоставлениями
  otherActivities?: Record<string, number>
  // Учителя, удалённые при ещё действующем access-токене: create отвечает referenceMissing
  deletedTeachers?: string[]
}

export function makeFakeMatchingRepository(options: FakeOptions = {}) {
  const records: FakeRecord[] = []
  const usedTokens = new Set(options.takenTokens ?? [])
  const alive = (id: string, teacherId: string) =>
    records.find((r) => r.matching.id === id && r.teacherId === teacherId && r.deletedAt === null)

  const repository: MatchingRepository = {
    async countByTeacher(teacherId) {
      const own = records.filter((r) => r.teacherId === teacherId && r.deletedAt === null).length
      return own + (options.otherActivities?.[teacherId] ?? 0)
    },
    async groupExists(slug) {
      return KNOWN_GROUPS.includes(slug)
    },
    async findOwned(id, teacherId) {
      return alive(id, teacherId)?.matching ?? null
    },
    async create(teacherId, input, shareToken, isPublic = true) {
      if (usedTokens.has(shareToken)) return null
      if (!KNOWN_GROUPS.includes(input.group) || options.deletedTeachers?.includes(teacherId)) return 'referenceMissing'
      usedTokens.add(shareToken)
      const matching = { ...input, id: randomUUID(), shareToken, updatedAt: new Date() }
      records.push({ teacherId, deletedAt: null, isPublic, matching })
      return matching
    },
    async updateOwned(id, teacherId, input) {
      const record = alive(id, teacherId)
      if (record === undefined) return false
      record.matching = { ...record.matching, ...input, updatedAt: new Date() }
      return true
    },
    async softDeleteOwned(id, teacherId) {
      const record = alive(id, teacherId)
      if (record === undefined) return false
      record.deletedAt = new Date()
      return true
    },
  }

  return { repository, records }
}
