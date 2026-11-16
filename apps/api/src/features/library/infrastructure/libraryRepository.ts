import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { LibraryQuizRow, LibraryRepository } from '../types'

// Одно условие публичности на все запросы: удалённое учителем, скрытое модерацией и непубличное не видны нигде
const PUBLIC_WHERE = { isPublic: true, deletedAt: null, moderationHiddenAt: null } satisfies Prisma.QuizWhereInput

// Явный select: id, teacherId, shareToken и updatedAt не должны уйти в публичный ответ ни при каких правках
const PUBLIC_SELECT = {
  publicNumber: true,
  title: true,
  groupSlug: true,
  gradingScale: true,
  questions: true,
  createdAt: true,
} satisfies Prisma.QuizSelect

// Для «Взять себе»: полное содержимое задания. Результат публичным не отдаётся — только копируется учителю
const COPY_SELECT = {
  title: true,
  showAnswers: true,
  gradingScale: true,
  groupSlug: true,
  questions: true,
} satisfies Prisma.QuizSelect

// Prisma передаёт contains в ILIKE как есть: % и _ из поиска иначе работали бы как шаблоны.
// Обратная косая — экранирующий символ LIKE в Postgres по умолчанию
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

type PublicRow = Prisma.QuizGetPayload<{ select: typeof PUBLIC_SELECT }>

function toLibraryQuizRow(row: PublicRow): LibraryQuizRow {
  return {
    number: row.publicNumber,
    title: row.title,
    groupSlug: row.groupSlug,
    graded: row.gradingScale !== null,
    questions: row.questions,
    createdAt: row.createdAt,
  }
}

export function makeLibraryRepository(prisma: PrismaClient): LibraryRepository {
  return {
    async listGroups() {
      return prisma.libraryGroup.findMany({ select: { slug: true, names: true }, orderBy: { sortOrder: 'asc' } })
    },

    async groupExists(slug) {
      return (await prisma.libraryGroup.count({ where: { slug } })) === 1
    },

    async list({ group, q, offset, limit }) {
      const rows = await prisma.quiz.findMany({
        where: { ...PUBLIC_WHERE, groupSlug: group, title: q === undefined ? undefined : { contains: escapeLike(q), mode: 'insensitive' } },
        select: PUBLIC_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit,
      })
      return rows.map(toLibraryQuizRow)
    },

    async findByNumber(number) {
      const row = await prisma.quiz.findFirst({ where: { ...PUBLIC_WHERE, publicNumber: number }, select: PUBLIC_SELECT })
      return row === null ? null : toLibraryQuizRow(row)
    },

    async findForCopy(number) {
      return prisma.quiz.findFirst({ where: { ...PUBLIC_WHERE, publicNumber: number }, select: COPY_SELECT })
    },
  }
}
