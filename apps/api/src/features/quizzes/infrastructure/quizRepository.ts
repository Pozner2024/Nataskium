import {
  type QuizSummary,
  quizInputSchema,
  quizSummarySchema,
  timerFromColumns,
  timerToColumns,
} from '@nataskium/shared/schemas'
import type { Prisma } from '../../../generated/prisma/client'
import { isForeignKeyViolation, isUniqueViolation } from '../../../shared/infrastructure'
import type { QuizRepository, StoredQuiz } from '../types'

const QUIZ_SELECT = {
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

type QuizRow = Prisma.QuizGetPayload<{ select: typeof QUIZ_SELECT }>

// Строка, не прошедшая схему, — рассинхрон данных и кода: внутренняя ошибка (500), а не ошибка клиента
function toStoredQuiz(row: QuizRow): StoredQuiz {
  const parsed = quizInputSchema.safeParse({
    title: row.title,
    showAnswers: row.showAnswers,
    gradingScale: row.gradingScale,
    group: row.groupSlug,
    timer: timerFromColumns(row.timerMode, row.timeLimitSeconds),
    questions: row.questions,
  })
  if (!parsed.success) throw new Error(`Stored quiz ${row.id} does not match the quiz schema`)

  return { ...parsed.data, id: row.id, shareToken: row.shareToken, updatedAt: row.updatedAt }
}

// Поля строки списка проверяются той же схемой, что и ответ: шкала из сырого запроса — просто строка
function toQuizSummary(row: unknown): QuizSummary {
  const parsed = quizSummarySchema.safeParse(row)
  if (!parsed.success) throw new Error('Stored quiz does not match the quiz summary schema')
  return parsed.data
}

// Принимает и клиент транзакции: в ней викторина сохраняется вместе с привязкой картинок
export function makeQuizRepository(prisma: Prisma.TransactionClient): QuizRepository {
  return {
    // Вопросы (до ~160 КБ jsonb на викторину) не загружаются и не разбираются: количество считает база.
    // Prisma не умеет jsonb_array_length в select; запрос параметризован тегированным шаблоном.
    // Не массив — NULL, и строка не пройдёт схему (500), как и прежде при рассинхроне
    async listByTeacher(teacherId) {
      const rows = await prisma.$queryRaw<unknown[]>`
        SELECT id::text AS id, title, share_token AS "shareToken", grading_scale AS "gradingScale",
          CASE WHEN jsonb_typeof(questions) = 'array' THEN jsonb_array_length(questions) END AS "questionCount"
        FROM quizzes
        WHERE teacher_id = ${teacherId}::uuid AND deleted_at IS NULL
        ORDER BY created_at DESC
      `
      return rows.map(toQuizSummary)
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
            ...timerToColumns(input.timer),
            questions: input.questions,
          },
          select: QUIZ_SELECT,
        })
        return toStoredQuiz(row)
      } catch (error) {
        if (isUniqueViolation(error)) return null
        if (isForeignKeyViolation(error)) return 'referenceMissing'
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
          ...timerToColumns(input.timer),
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

    async purgeDeletedBefore(olderThan) {
      const { count } = await prisma.quiz.deleteMany({ where: { deletedAt: { lt: olderThan } } })
      return count
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
