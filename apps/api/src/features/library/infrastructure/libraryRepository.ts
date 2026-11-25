import { z } from 'zod'
import { DEFAULT_INTRO_THEME_KEY, LIBRARY_THUMBNAIL_DEFINITIONS, activityKindSchema, introThemeKeySchema } from '@nataskium/shared/schemas'
import { Prisma, type PrismaClient } from '../../../generated/prisma/client'
import type { LibraryQuizListRow, LibraryRepository } from '../types'

// Одно условие публичности на все запросы: удалённое учителем, скрытое модерацией и непубличное не видны нигде
const PUBLIC_WHERE = { isPublic: true, deletedAt: null, moderationHiddenAt: null } satisfies Prisma.QuizWhereInput
// То же условие для сырого запроса списка — менять только вместе с PUBLIC_WHERE
const PUBLIC_SQL = Prisma.sql`is_public AND deleted_at IS NULL AND moderation_hidden_at IS NULL`

// Строка сырого запроса списка; questionCount или head NULL (questions не массив) — рассинхрон данных: внутренняя ошибка (500)
const listRowSchema = z.object({
  number: z.number().int(),
  type: activityKindSchema,
  title: z.string(),
  groupSlug: z.string(),
  graded: z.boolean(),
  createdAt: z.date(),
  questionCount: z.number().int().min(0),
  // Стиль убрали из каталога — стиль по умолчанию, как в игре: одно такое задание не должно ронять всю страницу
  introTheme: introThemeKeySchema.catch(DEFAULT_INTRO_THEME_KEY),
  head: z.array(z.unknown()),
})

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

// Задания всех типов: «Взять себе» ветвится по type в use-case
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
    // фрагменты Prisma.sql. Набор полей явный: id, teacher_id и share_token в публичный ответ не попадают.
    // Сначала страница (только id), затем количество вопросов для её строк: иначе база распаковывала бы jsonb
    // всех публичных заданий до сортировки
    async list({ group, q, offset, limit }) {
      // Превью: только первые элементы содержимого — для сопоставления нужно до трёх определений, остальным хватает одного
      const headPath = `$[0 to ${LIBRARY_THUMBNAIL_DEFINITIONS - 1}]`
      const byGroup = group === undefined ? Prisma.empty : Prisma.sql`AND group_slug = ${group}`
      const byTitle = q === undefined ? Prisma.empty : Prisma.sql`AND title ILIKE ${`%${escapeLike(q)}%`}`
      const rows = await prisma.$queryRaw<unknown[]>`
        WITH page AS (
          SELECT id FROM quizzes
          WHERE ${PUBLIC_SQL} ${byGroup} ${byTitle}
          ORDER BY created_at DESC, id DESC
          OFFSET ${offset} LIMIT ${limit}
        )
        SELECT q.public_number AS number, q.type, q.title, q.group_slug AS "groupSlug",
          q.grading_scale IS NOT NULL AS graded, q.created_at AS "createdAt",
          CASE WHEN jsonb_typeof(q.questions) = 'array' THEN jsonb_array_length(q.questions) END AS "questionCount",
          q.intro_theme AS "introTheme",
          CASE WHEN jsonb_typeof(q.questions) = 'array' THEN jsonb_path_query_array(q.questions, ${headPath}::jsonpath) END AS head
        FROM quizzes q JOIN page USING (id)
        ORDER BY q.created_at DESC, q.id DESC
      `
      return rows.map(toListRow)
    },

    // shareToken — только для вызова игры на сервере, в ответы не попадает
    async findPlayableShareToken(number) {
      const row = await prisma.quiz.findFirst({ where: { ...PUBLIC_WHERE, publicNumber: number }, select: { shareToken: true } })
      return row?.shareToken ?? null
    },

    async findForCopy(number) {
      const row = await prisma.quiz.findFirst({ where: { ...PUBLIC_WHERE, publicNumber: number }, select: COPY_SELECT })
      return row === null ? null : { ...row, type: parseType(row.type) }
    },
  }
}
