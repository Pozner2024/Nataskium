import { describe, expect, it } from 'vitest'
import { parseQuizSlug } from '../library'
import { MAX_LIBRARY_NUMBER, libraryListQuerySchema, libraryNumberSchema, libraryQuizResponseSchema } from './library'

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

describe('адрес картинки в карточке', () => {
  const quizCard = (imageUrl: string) => ({
    quiz: {
      number: 1,
      type: 'quiz',
      title: 'T',
      groupSlug: 'other',
      questionCount: 1,
      graded: false,
      createdAt: '2026-11-19T10:00:00.000Z',
      questions: [{ text: 'q', imageUrl, options: [{ text: 'a', imageUrl: null }] }],
    },
  })

  it('https проходит, javascript: и data: — нет', () => {
    expect(libraryQuizResponseSchema.safeParse(quizCard('https://images.example.test/quiz-images/a.webp')).success).toBe(true)
    expect(libraryQuizResponseSchema.safeParse(quizCard('javascript:alert(1)')).success).toBe(false)
    expect(libraryQuizResponseSchema.safeParse(quizCard('data:image/png;base64,AAAA')).success).toBe(false)
  })
})

describe('карточка библиотеки «да/нет»', () => {
  const card = { number: 1, type: 'truefalse', title: 'T', groupSlug: 'other', questionCount: 2, graded: false, createdAt: '2026-11-19T10:00:00.000Z', statements: ['a', 'b'] }

  it('принимает statements: string[]', () => {
    expect(libraryQuizResponseSchema.safeParse({ quiz: card }).success).toBe(true)
  })

  it('без statements отклоняется', () => {
    const withoutStatements = Object.fromEntries(Object.entries(card).filter(([key]) => key !== 'statements'))
    expect(libraryQuizResponseSchema.safeParse({ quiz: withoutStatements }).success).toBe(false)
  })

  it('ключи items и answer схема не отклоняет, но и не пропускает в результат', () => {
    const parsed = libraryQuizResponseSchema.parse({ quiz: { ...card, answer: true, items: [{ statement: 'a', answer: true }] } })
    expect(parsed.quiz).not.toHaveProperty('answer')
    expect(parsed.quiz).not.toHaveProperty('items')
  })
})
