import { describe, expect, it } from 'vitest'
import { parseQuizSlug } from '../library'
import {
  LIBRARY_THUMBNAIL_OPTIONS,
  LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH,
  MAX_LIBRARY_NUMBER,
  clipThumbnailText,
  libraryListItemSchema,
  libraryListQuerySchema,
  libraryNumberSchema,
  libraryThumbnailSchema,
} from './library'

const NUL = String.fromCharCode(0)

describe('граница номера библиотеки (INT4)', () => {
  it('libraryNumberSchema: 2147483647 проходит, 2147483648 нет', () => {
    expect(libraryNumberSchema.safeParse('2147483647').success).toBe(true)
    expect(libraryNumberSchema.safeParse('2147483648').success).toBe(false)
    expect(libraryNumberSchema.safeParse('3000000000').success).toBe(false)
  })

  it('parseQuizSlug согласован с границей', () => {
    expect(parseQuizSlug(`${MAX_LIBRARY_NUMBER}-a`)?.number).toBe(MAX_LIBRARY_NUMBER)
    expect(parseQuizSlug('2147483648-a')).toBeNull()
  })
})

describe('поиск библиотеки', () => {
  it('управляющие символы (NUL) отклоняются, обычный текст проходит', () => {
    expect(libraryListQuerySchema.safeParse({ q: `дроби${NUL}` }).success).toBe(false)
    expect(libraryListQuerySchema.safeParse({ q: 'дроби' }).success).toBe(true)
  })
})

describe('превью задания в списке', () => {
  it('clipThumbnailText: короткий текст не меняется', () => {
    expect(clipThumbnailText('абв', 5)).toBe('абв')
  })

  it('clipThumbnailText: длинный обрезается до лимита с многоточием', () => {
    const clipped = clipThumbnailText('a'.repeat(130), LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH)
    expect(clipped).toHaveLength(LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH)
    expect(clipped.endsWith('…')).toBe(true)
  })

  it('clipThumbnailText: эмодзи не разрезается пополам', () => {
    const clipped = clipThumbnailText('😀'.repeat(130), LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH)
    expect([...clipped]).toHaveLength(LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH)
    expect([...clipped].slice(0, -1).every((char) => char === '😀')).toBe(true)
  })

  it('слова сопоставления в превью не проходят', () => {
    expect(libraryThumbnailSchema.safeParse({ type: 'matching', definitions: ['лает'] }).success).toBe(true)
    expect(libraryThumbnailSchema.safeParse({ type: 'matching', definitions: ['лает'], terms: ['пёс'] }).success).toBe(false)
  })

  it('ответ «да/нет» в превью не проходит', () => {
    expect(libraryThumbnailSchema.safeParse({ type: 'truefalse', statement: 'a' }).success).toBe(true)
    expect(libraryThumbnailSchema.safeParse({ type: 'truefalse', statement: 'a', answer: true }).success).toBe(false)
  })

  it('адрес картинки в превью: https проходит, javascript: и data: — нет', () => {
    const quiz = (imageUrl: string) => ({ type: 'quiz', text: 'q', imageUrl, options: [{ text: 'a' }] })
    expect(libraryThumbnailSchema.safeParse(quiz('https://images.example.test/quiz-images/a.webp')).success).toBe(true)
    expect(libraryThumbnailSchema.safeParse(quiz('javascript:alert(1)')).success).toBe(false)
    expect(libraryThumbnailSchema.safeParse(quiz('data:image/png;base64,AAAA')).success).toBe(false)
  })

  it('вариантов викторины не больше лимита, isCorrect не проходит', () => {
    const options = (count: number) => Array.from({ length: count }, () => ({ text: 'a' }))
    const quiz = (opts: unknown[]) => ({ type: 'quiz', text: 'q', imageUrl: null, options: opts })
    expect(libraryThumbnailSchema.safeParse(quiz(options(LIBRARY_THUMBNAIL_OPTIONS))).success).toBe(true)
    expect(libraryThumbnailSchema.safeParse(quiz(options(LIBRARY_THUMBNAIL_OPTIONS + 1))).success).toBe(false)
    expect(libraryThumbnailSchema.safeParse(quiz([{ text: 'a', isCorrect: true }])).success).toBe(false)
  })

  it('элемент списка: стиль и превью, превью может быть null', () => {
    const item = {
      number: 1,
      type: 'quiz',
      title: 'T',
      groupSlug: 'other',
      questionCount: 0,
      graded: false,
      createdAt: '2026-11-19T10:00:00.000Z',
      introTheme: 'nataskium-day',
      thumbnail: null,
    }
    expect(libraryListItemSchema.safeParse(item).success).toBe(true)
    expect(libraryListItemSchema.safeParse({ ...item, introTheme: 'unknown' }).success).toBe(false)
  })
})
