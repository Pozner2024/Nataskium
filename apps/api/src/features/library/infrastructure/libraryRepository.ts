import { z } from 'zod'
import { activityKindSchema } from '@nataskium/shared/schemas'
import { Prisma, type PrismaClient } from '../../../generated/prisma/client'
import type { LibraryQuizListRow, LibraryQuizRow, LibraryRepository } from '../types'

// Одно условие публичности на все запросы: удалённое учителем, скрытое модерацией и непубличное не видны нигде
const PUBLIC_WHERE = { isPublic: true, deletedAt: null, moderationHiddenAt: null } satisfies Prisma.QuizWhereInput
// То же условие для сырого запроса списка — менять только вместе с PUBLIC_WHERE
const PUBLIC_SQL = Prisma.sql`is_public AND deleted_at IS NULL AND moderation_hidden_at IS NULL`

// Строка сырого запроса списка; questionCount NULL (questions не массив) — рассинхрон данных: внутренняя ошибка (500)
const listRowSchema = z.object({
  number: z.number().int(),
  type: activityKindSchema,
  title: z.string(),
  groupSlug: z.string(),
  graded: z.boolean(),
  createdAt: z.date(),
  questionCount: z.number().int().min(0),
})

// Явный select: id, teacherId, shareToken и updatedAt не должны уйти в публичный ответ ни при каких правках
const PUBLIC_SELECT = {
  publicNumber: true,
  type: true,
  title: true,
  groupSlug: true,
  gradingScale: true,
  questions: true,
  createdAt: true,
} satisfies Prisma.QuizSelect

// Для «Взять себе»: полное содержимое задания. Результат публичным не отдаётся — только копируется учителю
const COPY_SELECT = {
  type: true,
  title: true,
  showAnswers: true,
  gradingScale: true,
  groupSlug: true,
  timerMode: true,
  timeLimitSeconds: true,
  introTheme: true,
  questions: true,
} satisfies Prisma.QuizSelect

// Поиск — подстрока в ILIKE: % и _ из запроса иначе работали бы как шаблоны.
// Обратная косая — экранирующий символ LIKE в Postgres по умолчанию
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

type PublicRow = Prisma.QuizGetPayload<{ select: typeof PUBLIC_SELECT }>

function toListRow(row: unknown): LibraryQuizListRow {
  const parsed = listRowSchema.safeParse(row)
  if (!parsed.success) throw new Error('Library quiz does not match the list row schema')
  return parsed.data
}

// Тип вне ACTIVITY_KINDS — рассинхрон данных и кода (CHECK quizzes_type_check): внутренняя ошибка (500)
function parseType(type: string) {
  const parsed = activityKindSchema.safeParse(type)
  if (!parsed.success) throw new Error('Library quiz has an unknown type')
  return parsed.data
}

function toLibraryQuizRow(row: PublicRow): LibraryQuizRow {
  return {
    number: row.publicNumber,
    type: parseType(row.type),
    title: row.title,
    groupSlug: row.groupSlug,
    graded: row.gradingScale !== null,
    questions: row.questions,
    createdAt: row.createdAt,
  }
}

// Задания всех типов: карточка и «Взять себе» ветвятся по type в use-case
export function makeLibraryRepository(prisma: PrismaClient): LibraryRepository {
  return {
    async listGroups() {
      return prisma.libraryGroup.findMany({ select: { slug: true, names: true }, orderBy: { sortOrder: 'asc' } })
    },

    async groupExists(slug) {
      return (await prisma.libraryGroup.count({ where: { slug } })) === 1
    },

    // Вопросы (до ~160 КБ jsonb на задание) не загружаются и не разбираются: количество считает база.
    // Prisma не умеет jsonb_array_length в select. Все значения — параметры тегированного шаблона, фильтры —
    // фрагменты Prisma.sql. Набор полей явный: id, teacher_id и share_token в публичный ответ не попадают
    async list({ group, q, offset, limit }) {
      const byGroup = group === undefined ? Prisma.empty : Prisma.sql`AND group_slug = ${group}`
      const byTitle = q === undefined ? Prisma.empty : Prisma.sql`AND title ILIKE ${`%${escapeLike(q)}%`}`
      const rows = await prisma.$queryRaw<unknown[]>`
        SELECT public_number AS number, type, title, group_slug AS "groupSlug", grading_scale IS NOT NULL AS graded,
          created_at AS "createdAt",
          CASE WHEN jsonb_typeof(questions) = 'array' THEN jsonb_array_length(questions) END AS "questionCount"
        FROM quizzes
        WHERE ${PUBLIC_SQL} ${byGroup} ${byTitle}
        ORDER BY created_at DESC, id DESC
        OFFSET ${offset} LIMIT ${limit}
      `
      return rows.map(toListRow)
    },

    async findByNumber(number) {
      const row = await prisma.quiz.findFirst({ where: { ...PUBLIC_WHERE, publicNumber: number }, select: PUBLIC_SELECT })
      return row === null ? null : toLibraryQuizRow(row)
    },

    async findForCopy(number) {
      const row = await prisma.quiz.findFirst({ where: { ...PUBLIC_WHERE, publicNumber: number }, select: COPY_SELECT })
      return row === null ? null : { ...row, type: parseType(row.type) }
    },
  }
}
