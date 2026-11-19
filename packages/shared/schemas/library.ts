import { z } from 'zod'
import { SUPPORTED_LOCALES } from '../locales'
import { activityKindSchema } from './activity'

// Колонка quizzes.public_number — INT4
export const MAX_LIBRARY_NUMBER = 2_147_483_647
export const DEFAULT_GROUP_SLUG = 'other'
export const LIBRARY_PAGE_SIZE = 24
export const LIBRARY_MAX_PAGE = 200
export const LIBRARY_SEARCH_MIN_LENGTH = 2
export const LIBRARY_SEARCH_MAX_LENGTH = 60
// Сколько вопросов викторины видно на странице задания в библиотеке; остальные учитель получает после «Взять себе».
// У сопоставления видны все пары (ADR-0013)
export const LIBRARY_PREVIEW_QUESTIONS = 5

// Занят адресом карточки: /library/quiz/<номер>
const RESERVED_GROUP_SLUGS = ['quiz']

export const groupSlugSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,39}$/, 'Invalid group')
  .refine((slug) => !RESERVED_GROUP_SLUGS.includes(slug), 'Invalid group')

export const libraryNumberSchema = z.coerce.number().int().positive().max(MAX_LIBRARY_NUMBER)

// Названия групп лежат в БД на всех языках сайта: z.record с enum-ключами требует каждый язык
export const localizedNamesSchema = z.record(z.enum(SUPPORTED_LOCALES), z.string().trim().min(1))

export const libraryGroupSchema = z.object({
  slug: groupSlugSchema,
  names: localizedNamesSchema,
})

export const libraryGroupsResponseSchema = z.object({
  groups: z.array(libraryGroupSchema),
})

export const libraryListQuerySchema = z.object({
  group: groupSlugSchema.optional(),
  q: z.string().trim().min(LIBRARY_SEARCH_MIN_LENGTH).max(LIBRARY_SEARCH_MAX_LENGTH).optional(),
  page: z.coerce.number().int().min(1).max(LIBRARY_MAX_PAGE).default(1),
})

// Публичные данные: ни id, ни shareToken, ни данных автора, ни шкалы оценки (только факт оценивания)
export const libraryQuizSummarySchema = z.object({
  number: libraryNumberSchema,
  type: activityKindSchema,
  title: z.string(),
  groupSlug: groupSlugSchema,
  questionCount: z.number().int().min(0),
  graded: z.boolean(),
  createdAt: z.iso.datetime(),
})

export const libraryListResponseSchema = z.object({
  quizzes: z.array(libraryQuizSummarySchema),
  page: z.number().int().min(1),
  hasNext: z.boolean(),
})

const imageUrlSchema = z.url().nullable()

// Без isCorrect и selectCount: правильные ответы публично не показываются
const libraryQuizCardSchema = libraryQuizSummarySchema.extend({
  type: z.literal('quiz'),
  questions: z.array(
    z.object({
      text: z.string(),
      imageUrl: imageUrlSchema,
      options: z.array(z.object({ text: z.string(), imageUrl: imageUrlSchema })),
    }),
  ),
})

// Все определения по порядку и все слова, перемешанные сервером: ровно то же, что отдаёт игра (ADR-0013)
const libraryMatchingCardSchema = libraryQuizSummarySchema.extend({
  type: z.literal('matching'),
  definitions: z.array(z.string()),
  terms: z.array(z.string()),
})

// Только утверждения: правильные ответы публично не показываются
const libraryTrueFalseCardSchema = libraryQuizSummarySchema.extend({
  type: z.literal('truefalse'),
  statements: z.array(z.string()),
})

export const libraryQuizResponseSchema = z.object({
  quiz: z.discriminatedUnion('type', [libraryQuizCardSchema, libraryMatchingCardSchema, libraryTrueFalseCardSchema]),
})

// type — какой редактор открыть после копирования
export const libraryTakeResponseSchema = z.object({
  quizId: z.uuid(),
  type: activityKindSchema,
})

export type LibraryGroup = z.infer<typeof libraryGroupSchema>
export type LibraryGroupsResponse = z.infer<typeof libraryGroupsResponseSchema>
export type LibraryListQuery = z.infer<typeof libraryListQuerySchema>
export type LibraryQuizSummary = z.infer<typeof libraryQuizSummarySchema>
export type LibraryListResponse = z.infer<typeof libraryListResponseSchema>
export type LibraryQuizResponse = z.infer<typeof libraryQuizResponseSchema>
export type LibraryTakeResponse = z.infer<typeof libraryTakeResponseSchema>
