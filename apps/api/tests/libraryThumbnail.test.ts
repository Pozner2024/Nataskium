import {
  LIBRARY_THUMBNAIL_OPTION_MAX_LENGTH,
  LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH,
  QUESTION_TEXT_MAX_LENGTH,
  libraryListResponseSchema,
} from '@nataskium/shared/schemas'
import { describe, expect, it, vi } from 'vitest'
import { type LibraryQuizListRow, type LibraryRepository, makeListLibraryQuizzes } from '../src/features/library'

const IMAGE_ID = '0b9b5a3e-5f1f-4a52-9d55-0d4f5f0c2a11'
const SECRET_TEXT = 'СЕКРЕТНЫЙ-ТЕКСТ-9c1d'

function listRow(overrides: Partial<LibraryQuizListRow>): LibraryQuizListRow {
  return {
    number: 1,
    type: 'quiz',
    title: 'Задание',
    groupSlug: 'other',
    graded: false,
    createdAt: new Date('2026-11-23T10:00:00.000Z'),
    questionCount: 1,
    introTheme: 'nataskium-day',
    head: [],
    ...overrides,
  }
}

async function listResponse(row: LibraryQuizListRow, imageUrl: (id: string) => string | null = (id) => `https://img.test/${id}`) {
  const library = { list: vi.fn(async () => [row]), groupExists: vi.fn(async () => true) } as unknown as LibraryRepository
  const listLibraryQuizzes = makeListLibraryQuizzes({ library, imageUrl })
  return listLibraryQuizzes({ page: 1 })
}

async function listOne(row: LibraryQuizListRow, imageUrl?: (id: string) => string | null) {
  return (await listResponse(row, imageUrl)).quizzes[0]!
}

const option = (text: string, isCorrect: boolean, imageId: string | null = null) => ({ text, isCorrect, imageId })

describe('превью задания в списке библиотеки', () => {
  it('викторина: первый вопрос, не больше 4 вариантов, без isCorrect, адрес картинки', async () => {
    const question = {
      text: 'Столица Франции?',
      imageId: IMAGE_ID,
      options: [option('Париж', true), option('Рим', false), option('', false, IMAGE_ID), option('Берлин', false), option('Мадрид', false), option('Лондон', true)],
    }
    const item = await listOne(listRow({ head: [question, { ...question, text: 'Второй' }] }))

    expect(item.introTheme).toBe('nataskium-day')
    expect(item.thumbnail).toEqual({
      type: 'quiz',
      text: 'Столица Франции?',
      imageUrl: `https://img.test/${IMAGE_ID}`,
      options: [{ text: 'Париж' }, { text: 'Рим' }, { text: '' }, { text: 'Берлин' }],
    })
    expect(JSON.stringify(item)).not.toContain('isCorrect')
  })

  it('викторина без картинки: imageUrl null', async () => {
    const item = await listOne(listRow({ head: [{ text: 'q', imageId: null, options: [option('a', true), option('b', false)] }] }))
    expect(item.thumbnail).toMatchObject({ type: 'quiz', imageUrl: null })
  })

  it('длинный текст вопроса обрезается', async () => {
    const item = await listOne(listRow({ head: [{ text: 'я'.repeat(QUESTION_TEXT_MAX_LENGTH), imageId: null, options: [option('a', true), option('b', false)] }] }))
    expect(item.thumbnail).toMatchObject({ type: 'quiz' })
    expect((item.thumbnail as { text: string }).text.endsWith('…')).toBe(true)
    expect((item.thumbnail as { text: string }).text.length).toBeLessThan(QUESTION_TEXT_MAX_LENGTH)
  })

  it('«да/нет»: первое утверждение без ответа', async () => {
    const item = await listOne(listRow({ type: 'truefalse', head: [{ statement: 'Земля круглая', answer: true }, { statement: 'Второе', answer: false }] }))
    expect(item.thumbnail).toEqual({ type: 'truefalse', statement: 'Земля круглая' })
    expect(JSON.stringify(item)).not.toContain('answer')
  })

  it('сопоставление: только определения, ни одного слова', async () => {
    const head = [1, 2, 3].map((n) => ({ term: `СЛОВО-${n}`, definition: `определение ${n}` }))
    const item = await listOne(listRow({ type: 'matching', head }))
    expect(item.thumbnail).toEqual({ type: 'matching', definitions: ['определение 1', 'определение 2', 'определение 3'] })
    expect(JSON.stringify(item)).not.toContain('СЛОВО-')
    expect(JSON.stringify(item)).not.toContain('term')
  })

  it('задание без вопросов: превью null', async () => {
    const item = await listOne(listRow({ head: [] }))
    expect(item.thumbnail).toBeNull()
  })

  it('начало задания неверной формы: превью null, список не ломается и текст не уходит', async () => {
    const item = await listOne(listRow({ head: [{ foo: SECRET_TEXT }] }))
    expect(item.thumbnail).toBeNull()
    expect(JSON.stringify(item)).not.toContain(SECRET_TEXT)
  })
})

describe('превью: лимиты и утечки', () => {
  const OPTION_IMAGE_ID = '7d4c2b1a-0e9f-4c3b-8a2d-1f0e9d8c7b6a'
  const quizHead = (text: string, options = [option('a', true), option('b', false)], imageId: string | null = null) => [{ text, imageId, options }]

  it('текст вопроса ровно по лимиту не меняется, на символ длиннее — обрезается до лимита с «…»', async () => {
    const exact = 'я'.repeat(LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH)
    const longer = exact + 'ю'

    const kept = await listOne(listRow({ head: quizHead(exact) }))
    const clipped = await listOne(listRow({ head: quizHead(longer) }))

    expect(kept.thumbnail).toMatchObject({ type: 'quiz', text: exact })
    expect(clipped.thumbnail).toMatchObject({ type: 'quiz', text: 'я'.repeat(LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH - 1) + '…' })
  })

  it('варианты обрезаются по лимиту варианта, а не по лимиту вопроса', async () => {
    const exact = 'б'.repeat(LIBRARY_THUMBNAIL_OPTION_MAX_LENGTH)
    const longer = 'в'.repeat(LIBRARY_THUMBNAIL_OPTION_MAX_LENGTH + 5)
    const item = await listOne(listRow({ head: quizHead('q', [option(exact, true), option(longer, false)]) }))

    expect(item.thumbnail).toMatchObject({
      type: 'quiz',
      options: [{ text: exact }, { text: 'в'.repeat(LIBRARY_THUMBNAIL_OPTION_MAX_LENGTH - 1) + '…' }],
    })
  })

  it('«да/нет»: длинное утверждение обрезается до лимита', async () => {
    const statement = 'у'.repeat(LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH + 30)
    const item = await listOne(listRow({ type: 'truefalse', head: [{ statement, answer: true }] }))

    expect(item.thumbnail).toEqual({ type: 'truefalse', statement: 'у'.repeat(LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH - 1) + '…' })
  })

  it('сопоставление: длинные определения обрезаются, каждое отдельно', async () => {
    const long = 'о'.repeat(LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH + 30)
    const item = await listOne(listRow({ type: 'matching', head: [{ term: 'пёс', definition: long }, { term: 'кот', definition: 'мяукает' }] }))

    expect(item.thumbnail).toEqual({ type: 'matching', definitions: ['о'.repeat(LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH - 1) + '…', 'мяукает'] })
  })

  it('сопоставление с двумя парами: два определения, без пустых добавок', async () => {
    const item = await listOne(listRow({ type: 'matching', questionCount: 2, head: [{ term: 'пёс', definition: 'лает' }, { term: 'кот', definition: 'мяукает' }] }))

    expect(item.thumbnail).toEqual({ type: 'matching', definitions: ['лает', 'мяукает'] })
  })

  it('id картинок вариантов не уходят в ответ, ключа imageId нет', async () => {
    const item = await listOne(listRow({ head: quizHead('q', [option('', true, OPTION_IMAGE_ID), option('b', false)], IMAGE_ID) }))

    expect(item.thumbnail).toMatchObject({ type: 'quiz', imageUrl: `https://img.test/${IMAGE_ID}`, options: [{ text: '' }, { text: 'b' }] })
    const json = JSON.stringify(item)
    expect(json).not.toContain(OPTION_IMAGE_ID)
    expect(json).not.toContain('"imageId"')
  })

  it('хранилище не настроено: imageUrl null, сырой id картинки не уходит', async () => {
    const item = await listOne(listRow({ head: quizHead('q', undefined, IMAGE_ID) }), () => null)

    expect(item.thumbnail).toMatchObject({ type: 'quiz', text: 'q', imageUrl: null })
    expect(JSON.stringify(item)).not.toContain(IMAGE_ID)
  })

  it('ответ с обрезанными текстами проходит схему ответа списка', async () => {
    const response = await listResponse(listRow({ head: quizHead('я'.repeat(QUESTION_TEXT_MAX_LENGTH), [option('б'.repeat(60), true), option('b', false)]) }))

    expect(libraryListResponseSchema.safeParse(response).success).toBe(true)
  })

  // Фронтенд проверяет ответ этой схемой: не прошедший текст уронил бы загрузку всей страницы библиотеки
  it('вопрос и варианты из эмодзи: обрезка и схема ответа считают одинаково', async () => {
    const response = await listResponse(listRow({ head: quizHead('😀'.repeat(QUESTION_TEXT_MAX_LENGTH), [option('😺'.repeat(60), true), option('b', false)]) }))

    expect(libraryListResponseSchema.safeParse(response).success).toBe(true)
  })
})
