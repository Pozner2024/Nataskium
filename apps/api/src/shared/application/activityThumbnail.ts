import {
  LIBRARY_THUMBNAIL_DEFINITIONS,
  LIBRARY_THUMBNAIL_OPTION_MAX_LENGTH,
  LIBRARY_THUMBNAIL_OPTIONS,
  LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH,
  type ActivityKind,
  type LibraryThumbnail,
  MATCHING_ACTIVITY,
  TRUE_FALSE_ACTIVITY,
  clipThumbnailText,
  matchingPairSchema,
  quizQuestionSchema,
  trueFalseItemSchema,
} from '@nataskium/shared/schemas'
import { z } from 'zod'

// Адрес картинки по id; null — хранилище не настроено. Связывание с хранилищем — в app.ts
export type ImageUrl = (imageId: string) => string | null

// Строка задания для превью: тип и первые элементы содержимого (head). Вопросы целиком не загружаются
export type ThumbnailSource = { type: ActivityKind; head: unknown[] }

const clipText = (text: string) => clipThumbnailText(text, LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH)

// Поэлементные схемы, а не схемы всего задания: у тех min на число вопросов, а здесь только начало.
// null — начало не прошло схему: битое задание показывается без превью, как и раньше не ломая список
function parseHead<T extends z.ZodType>(row: ThumbnailSource, element: T): z.infer<T>[] | null {
  const parsed = z.array(element).safeParse(row.head)
  return parsed.success ? parsed.data : null
}

// Превью одно для библиотеки и «Моих заданий». Поля собираются явно: правильные ответы и слова сопоставления
// не должны попасть в публичный ответ ни при каких правках.
// У сопоставления только определения: набор показанных слов выдал бы связь с ними (ADR-0013)
export function toActivityThumbnail(row: ThumbnailSource, imageUrl: ImageUrl): LibraryThumbnail | null {
  if (row.head.length === 0) return null
  if (row.type === MATCHING_ACTIVITY) {
    const pairs = parseHead(row, matchingPairSchema)
    if (pairs === null) return null
    return { type: MATCHING_ACTIVITY, definitions: pairs.slice(0, LIBRARY_THUMBNAIL_DEFINITIONS).map((pair) => clipText(pair.definition)) }
  }
  if (row.type === TRUE_FALSE_ACTIVITY) {
    const item = parseHead(row, trueFalseItemSchema)?.[0]
    if (item === undefined) return null
    return { type: TRUE_FALSE_ACTIVITY, statement: clipText(item.statement) }
  }
  const question = parseHead(row, quizQuestionSchema)?.[0]
  if (question === undefined) return null
  return {
    type: 'quiz',
    text: clipText(question.text),
    imageUrl: question.imageId === null ? null : imageUrl(question.imageId),
    options: question.options
      .slice(0, LIBRARY_THUMBNAIL_OPTIONS)
      .map((option) => ({ text: clipThumbnailText(option.text, LIBRARY_THUMBNAIL_OPTION_MAX_LENGTH) })),
  }
}
