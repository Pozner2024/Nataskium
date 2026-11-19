import { TRUE_FALSE_ACTIVITY, type TrueFalseInput, trueFalseInputSchema, timerFromColumns, timerToColumns } from '@nataskium/shared/schemas'
import type { Prisma } from '../../../generated/prisma/client'
import { isForeignKeyViolation, isUniqueViolation } from '../../../shared/infrastructure'
import type { TrueFalseRepository, StoredTrueFalse } from '../types'

const TRUE_FALSE_SELECT = {
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

type TrueFalseRow = Prisma.QuizGetPayload<{ select: typeof TRUE_FALSE_SELECT }>

// Утверждения лежат в колонке questions. Строка, не прошедшая схему, — рассинхрон данных и кода: 500
function toStoredTrueFalse(row: TrueFalseRow): StoredTrueFalse {
  const parsed = trueFalseInputSchema.safeParse({
    title: row.title,
    showAnswers: row.showAnswers,
    gradingScale: row.gradingScale,
    group: row.groupSlug,
    timer: timerFromColumns(row.timerMode, row.timeLimitSeconds),
    items: row.questions,
  })
  if (!parsed.success) throw new Error(`Stored true/false ${row.id} does not match the true/false schema`)

  return { ...parsed.data, id: row.id, shareToken: row.shareToken, updatedAt: row.updatedAt }
}

function toColumns(input: TrueFalseInput) {
  return {
    title: input.title,
    showAnswers: input.showAnswers,
    gradingScale: input.gradingScale,
    groupSlug: input.group,
    ...timerToColumns(input.timer),
    questions: input.items,
  }
}

export function makeTrueFalseRepository(prisma: Prisma.TransactionClient): TrueFalseRepository {
  return {
    // Намеренно без фильтра по типу: лимит заданий общий на все типы
    async countByTeacher(teacherId) {
      return prisma.quiz.count({ where: { teacherId, deletedAt: null } })
    },

    async groupExists(slug) {
      return (await prisma.libraryGroup.count({ where: { slug } })) === 1
    },

    async findOwned(id, teacherId) {
      const row = await prisma.quiz.findFirst({ where: { id, teacherId, type: TRUE_FALSE_ACTIVITY, deletedAt: null }, select: TRUE_FALSE_SELECT })
      return row === null ? null : toStoredTrueFalse(row)
    },

    async create(teacherId, input, shareToken, isPublic = true) {
      try {
        const row = await prisma.quiz.create({
          data: { teacherId, type: TRUE_FALSE_ACTIVITY, shareToken, isPublic, ...toColumns(input) },
          select: TRUE_FALSE_SELECT,
        })
        return toStoredTrueFalse(row)
      } catch (error) {
        if (isUniqueViolation(error)) return null
        if (isForeignKeyViolation(error)) return 'referenceMissing'
        throw error
      }
    },

    async updateOwned(id, teacherId, input) {
      const { count } = await prisma.quiz.updateMany({
        where: { id, teacherId, type: TRUE_FALSE_ACTIVITY, deletedAt: null },
        data: toColumns(input),
      })
      return count === 1
    },

    async softDeleteOwned(id, teacherId) {
      const { count } = await prisma.quiz.updateMany({
        where: { id, teacherId, type: TRUE_FALSE_ACTIVITY, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      return count === 1
    },

    async findByShareToken(token) {
      const row = await prisma.quiz.findFirst({ where: { shareToken: token, type: TRUE_FALSE_ACTIVITY, deletedAt: null }, select: TRUE_FALSE_SELECT })
      return row === null ? null : toStoredTrueFalse(row)
    },
  }
}
