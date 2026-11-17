import { MATCHING_ACTIVITY, type MatchingInput, matchingInputSchema, timerFromColumns, timerToColumns } from '@nataskium/shared/schemas'
import type { Prisma } from '../../../generated/prisma/client'
import { isForeignKeyViolation, isUniqueViolation } from '../../../shared/infrastructure'
import type { MatchingRepository, StoredMatching } from '../types'

const MATCHING_SELECT = {
  id: true,
  title: true,
  shareToken: true,
  showAnswers: true,
  gradingScale: true,
  groupSlug: true,
  timerMode: true,
  timeLimitSeconds: true,
  questions: true,
  updatedAt: true,
} satisfies Prisma.QuizSelect

type MatchingRow = Prisma.QuizGetPayload<{ select: typeof MATCHING_SELECT }>

// Пары лежат в колонке questions (ADR-0013). Строка, не прошедшая схему, — рассинхрон данных и кода: 500
function toStoredMatching(row: MatchingRow): StoredMatching {
  const parsed = matchingInputSchema.safeParse({
    title: row.title,
    showAnswers: row.showAnswers,
    gradingScale: row.gradingScale,
    group: row.groupSlug,
    timer: timerFromColumns(row.timerMode, row.timeLimitSeconds),
    pairs: row.questions,
  })
  if (!parsed.success) throw new Error(`Stored matching ${row.id} does not match the matching schema`)

  return { ...parsed.data, id: row.id, shareToken: row.shareToken, updatedAt: row.updatedAt }
}

function toColumns(input: MatchingInput) {
  return {
    title: input.title,
    showAnswers: input.showAnswers,
    gradingScale: input.gradingScale,
    groupSlug: input.group,
    ...timerToColumns(input.timer),
    questions: input.pairs,
  }
}

export function makeMatchingRepository(prisma: Prisma.TransactionClient): MatchingRepository {
  return {
    // Намеренно без фильтра по типу: лимит заданий общий на все типы
    async countByTeacher(teacherId) {
      return prisma.quiz.count({ where: { teacherId, deletedAt: null } })
    },

    async groupExists(slug) {
      return (await prisma.libraryGroup.count({ where: { slug } })) === 1
    },

    async findOwned(id, teacherId) {
      const row = await prisma.quiz.findFirst({ where: { id, teacherId, type: MATCHING_ACTIVITY, deletedAt: null }, select: MATCHING_SELECT })
      return row === null ? null : toStoredMatching(row)
    },

    async create(teacherId, input, shareToken, isPublic = true) {
      try {
        const row = await prisma.quiz.create({
          data: { teacherId, type: MATCHING_ACTIVITY, shareToken, isPublic, ...toColumns(input) },
          select: MATCHING_SELECT,
        })
        return toStoredMatching(row)
      } catch (error) {
        if (isUniqueViolation(error)) return null
        if (isForeignKeyViolation(error)) return 'referenceMissing'
        throw error
      }
    },

    async updateOwned(id, teacherId, input) {
      const { count } = await prisma.quiz.updateMany({
        where: { id, teacherId, type: MATCHING_ACTIVITY, deletedAt: null },
        data: toColumns(input),
      })
      return count === 1
    },

    async softDeleteOwned(id, teacherId) {
      const { count } = await prisma.quiz.updateMany({
        where: { id, teacherId, type: MATCHING_ACTIVITY, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      return count === 1
    },

    async findByShareToken(token) {
      const row = await prisma.quiz.findFirst({ where: { shareToken: token, type: MATCHING_ACTIVITY, deletedAt: null }, select: MATCHING_SELECT })
      return row === null ? null : toStoredMatching(row)
    },
  }
}
