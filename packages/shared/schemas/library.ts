import { z } from 'zod'
import { SUPPORTED_LOCALES } from '../locales'
import { activityKindSchema } from './activity'
import { introThemeKeySchema } from './introTheme'
import { hasNoUnsafeChars } from './textChars'

// Колонка quizzes.public_number — INT4
export const MAX_LIBRARY_NUMBER = 2_147_483_647
export const DEFAULT_GROUP_SLUG = 'other'
export const LIBRARY_PAGE_SIZE = 24
const LIBRARY_MAX_PAGE = 200
export const LIBRARY_SEARCH_MIN_LENGTH = 2
export const LIBRARY_SEARCH_MAX_LENGTH = 60

// Превью первого вопроса в списке: тексты короткие — в миниатюре длиннее всё равно не прочитать, а ответ остаётся лёгким
export const LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH = 120
export const LIBRARY_THUMBNAIL_OPTION_MAX_LENGTH = 40
export const LIBRARY_THUMBNAIL_OPTIONS = 4
export const LIBRARY_THUMBNAIL_DEFINITIONS = 3

const ELLIPSIS = '…'

// Режет по символам, а не по UTF-16: иначе эмодзи на границе распадался бы на половинки
export function clipThumbnailText(text: string, maxLength: number): string {
  const chars = [...text]
  if (chars.length <= maxLength) return text
  return chars.slice(0, maxLength - 1).join('') + ELLIPSIS
}

// Занят адресом задания: /library/quiz/<номер>
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
  type: activityKindSchema.optional(),
  // Без управляющих символов: NUL Postgres не примет в параметре, и вместо 400 был бы 500
  q: z
    .string()
    .trim()
    .min(LIBRARY_SEARCH_MIN_LENGTH)
    .max(LIBRARY_SEARCH_MAX_LENGTH)
    .refine((text) => hasNoUnsafeChars(text), 'Search contains unsupported characters')
    .optional(),
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

// Только http(s): адрес картинки строит сервер, а javascript:/data: не должны пройти ни в какой приёмник
const imageUrlSchema = z.url({ protocol: /^https?$/ }).nullable()

const thumbnailText = z.string().max(LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH)

// Начало задания для миниатюры, без правильных ответов. У сопоставления — только определения:
// набор показанных слов выдал бы их связь с определениями (ADR-0013)
export const libraryThumbnailSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('quiz'),
    text: thumbnailText,
    imageUrl: imageUrlSchema,
    options: z.array(z.strictObject({ text: z.string().max(LIBRARY_THUMBNAIL_OPTION_MAX_LENGTH) })).max(LIBRARY_THUMBNAIL_OPTIONS),
  }),
  z.strictObject({ type: z.literal('truefalse'), statement: thumbnailText }),
  z.strictObject({ type: z.literal('matching'), definitions: z.array(thumbnailText).max(LIBRARY_THUMBNAIL_DEFINITIONS) }),
])

// null — в задании нет вопросов
export const libraryListItemSchema = libraryQuizSummarySchema.extend({
  introTheme: introThemeKeySchema,
  thumbnail: libraryThumbnailSchema.nullable(),
})

export const libraryListResponseSchema = z.object({
  quizzes: z.array(libraryListItemSchema),
  page: z.number().int().min(1),
  hasNext: z.boolean(),
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
export type LibraryThumbnail = z.infer<typeof libraryThumbnailSchema>
export type LibraryListItem = z.infer<typeof libraryListItemSchema>
export type LibraryListResponse = z.infer<typeof libraryListResponseSchema>
export type LibraryTakeResponse = z.infer<typeof libraryTakeResponseSchema>
