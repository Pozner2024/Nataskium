import { quizInputSchema } from '@nataskium/shared/schemas'
import type { Prisma } from '../../../generated/prisma/client'
import { isUniqueViolation } from '../../../shared/infrastructure'
import type { QuizRepository, StoredQuiz } from '../types'

const QUIZ_SELECT = {
  id: true,
  title: true,
  shareToken: true,
  showAnswers: true,
  gradingScale: true,
  groupSlug: true,
  questions: true,
  updatedAt: true,
} satisfies Prisma.QuizSelect

type QuizRow = Prisma.QuizGetPayload<{ select: typeof QUIZ_SELECT }>

// Строка, не прошедшая схему, — рассинхрон данных и кода: внутренняя ошибка (500), а не ошибка клиента
function toStoredQuiz(row: QuizRow): StoredQuiz {
  const parsed = quizInputSchema.safeParse({
    title: row.title,
    showAnswers: row.showAnswers,
    gradingScale: row.gradingScale,
    group: row.groupSlug,
    questions: row.questions,
  })
  if (!parsed.success) throw new Error(`Stored quiz ${row.id} does not match the quiz schema`)

  return { ...parsed.data, id: row.id, shareToken: row.shareToken, updatedAt: row.updatedAt }
}

// Принимает и клиент транзакции: в ней викторина сохраняется вместе с привязкой картинок
export function makeQuizRepository(prisma: Prisma.TransactionClient): QuizRepository {
  return {
    async listByTeacher(teacherId) {
      const rows = await prisma.quiz.findMany({
        where: { teacherId, deletedAt: null },
        select: QUIZ_SELECT,
        orderBy: { createdAt: 'desc' },
      })
      return rows.map(toStoredQuiz)
    },

    async countByTeacher(teacherId) {
      return prisma.quiz.count({ where: { teacherId, deletedAt: null } })
    },

    async findOwned(id, teacherId) {
      const row = await prisma.quiz.findFirst({ where: { id, teacherId, deletedAt: null }, select: QUIZ_SELECT })
      return row === null ? null : toStoredQuiz(row)
    },

    async create(teacherId, input, shareToken, isPublic = true) {
      try {
        const row = await prisma.quiz.create({
          data: {
            teacherId,
            shareToken,
            isPublic,
            title: input.title,
            showAnswers: input.showAnswers,
            gradingScale: input.gradingScale,
            groupSlug: input.group,
            questions: input.questions,
          },
          select: QUIZ_SELECT,
        })
        return toStoredQuiz(row)
      } catch (error) {
        if (isUniqueViolation(error)) return null
        throw error
      }
    },

    async updateOwned(id, teacherId, input) {
      const { count } = await prisma.quiz.updateMany({
        where: { id, teacherId, deletedAt: null },
        data: {
          title: input.title,
          showAnswers: input.showAnswers,
          gradingScale: input.gradingScale,
          groupSlug: input.group,
          questions: input.questions,
        },
      })
      return count === 1
    },

    async softDeleteOwned(id, teacherId) {
      const { count } = await prisma.quiz.updateMany({
        where: { id, teacherId, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      return count === 1
    },

    async groupExists(slug) {
      return (await prisma.libraryGroup.count({ where: { slug } })) === 1
    },

    async findByShareToken(token) {
      const row = await prisma.quiz.findFirst({ where: { shareToken: token, deletedAt: null }, select: QUIZ_SELECT })
      return row === null ? null : toStoredQuiz(row)
    },
  }
}
