import { randomBytes, randomUUID } from 'node:crypto'
import { LIBRARY_PAGE_SIZE, LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH, libraryListResponseSchema } from '@nataskium/shared/schemas'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client'
import { MEMORY_IMAGES_BASE_URL, makeMemoryImageStorage } from '../fakes/memoryImageStorage'
import { TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher, days, fromNow } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const LIBRARY = '/api/library'
const SUMMARY_KEYS = ['createdAt', 'graded', 'groupSlug', 'introTheme', 'number', 'questionCount', 'thumbnail', 'title', 'type']
const QUESTION = {
  text: 'Вопрос',
  imageId: null,
  options: [
    { text: 'Да', isCorrect: true, imageId: null },
    { text: 'Нет', isCorrect: false, imageId: null },
  ],
}

let prisma: PrismaClient
let teacherId: string

type SeedOptions = Partial<Pick<Prisma.QuizUncheckedCreateInput, 'isPublic' | 'deletedAt' | 'moderationHiddenAt' | 'gradingScale' | 'groupSlug' | 'createdAt' | 'type'>> & {
  questions?: Prisma.InputJsonValue
}

async function seed(title: string, options: SeedOptions = {}) {
  const { questions = [QUESTION], ...rest } = options
  return prisma.quiz.create({
    data: { teacherId, title, shareToken: randomBytes(16).toString('base64url'), questions, ...rest },
  })
}

function list(query = '', imageStorage: ReturnType<typeof makeMemoryImageStorage>['storage'] | null = null) {
  return createTestApp({ prisma, imageStorage }).request(`${LIBRARY}${query}`, { headers: { origin: TEST_WEB_ORIGIN } }, fromIp())
}

async function titles(query = ''): Promise<string[]> {
  const response = await list(query)
  expect(response.status).toBe(200)
  return libraryListResponseSchema.parse(await response.json()).quizzes.map((quiz) => quiz.title)
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})
beforeEach(async () => {
  await truncateAll(prisma)
  teacherId = (await createTeacher(prisma)).id
})
afterEach(() => {
  vi.restoreAllMocks()
})
afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('GET /api/library: список', () => {
  it('только публичные: непубличное, удалённое и скрытое модерацией не видны', async () => {
    await seed('Видно')
    await seed('Непубличное', { isPublic: false })
    await seed('Удалённое', { deletedAt: new Date() })
    await seed('Скрытое', { moderationHiddenAt: new Date() })

    expect(await titles()).toEqual(['Видно'])
  })

  it('поля карточки — ровно публичные: ни id, ни teacherId, ни shareToken, ни шкалы', async () => {
    const quiz = await seed('Столицы', { gradingScale: 'five', questions: [QUESTION, QUESTION, QUESTION] })

    const body = (await (await list()).json()) as { quizzes: Record<string, unknown>[] }

    expect(body.quizzes).toHaveLength(1)
    const [card] = body.quizzes
    expect(Object.keys(card!).sort()).toEqual(SUMMARY_KEYS)
    expect(card).toEqual({
      number: quiz.publicNumber,
      type: 'quiz',
      title: 'Столицы',
      groupSlug: 'other',
      questionCount: 3,
      graded: true,
      createdAt: quiz.createdAt.toISOString(),
      introTheme: 'nataskium-night',
      thumbnail: { type: 'quiz', text: 'Вопрос', imageUrl: null, options: [{ text: 'Да' }, { text: 'Нет' }] },
    })
    expect(JSON.stringify(body)).not.toContain(quiz.id)
    expect(JSON.stringify(body)).not.toContain(quiz.shareToken)
    expect(JSON.stringify(body)).not.toContain(teacherId)
  })

  it('новые сверху; при одинаковой дате — стабильный порядок по id', async () => {
    const same = fromNow(-days(1))
    await seed('Старое', { createdAt: fromNow(-days(3)) })
    const a = await seed('Пара А', { createdAt: same })
    const b = await seed('Пара Б', { createdAt: same })
    await seed('Новое', { createdAt: fromNow(-days(0.5)) })

    const pair = [a, b].sort((x, y) => (x.id < y.id ? 1 : -1)).map((quiz) => quiz.title)
    expect(await titles()).toEqual(['Новое', ...pair, 'Старое'])
  })

  it(`страницы по ${LIBRARY_PAGE_SIZE}: hasNext на первой, остаток на второй`, async () => {
    for (let i = 0; i <= LIBRARY_PAGE_SIZE; i++) await seed(`Задание ${i}`, { createdAt: fromNow(-days(i + 1)) })

    const first = libraryListResponseSchema.parse(await (await list()).json())
    const second = libraryListResponseSchema.parse(await (await list('?page=2')).json())

    expect(first.quizzes).toHaveLength(LIBRARY_PAGE_SIZE)
    expect(first).toMatchObject({ page: 1, hasNext: true })
    expect(second.quizzes.map((quiz) => quiz.title)).toEqual([`Задание ${LIBRARY_PAGE_SIZE}`])
    expect(second).toMatchObject({ page: 2, hasNext: false })
  })

  it('фильтр по группе', async () => {
    await seed('Алгебра', { groupSlug: 'exact' })
    await seed('Разное')

    expect(await titles('?group=exact')).toEqual(['Алгебра'])
  })

  it('фильтр по типу: только этот тип из всех разделов', async () => {
    await seed('Викторина А', { groupSlug: 'exact' })
    await seed('Викторина Б')
    await seed('Пары', { type: 'matching', questions: [{ term: 'пёс', definition: 'лает' }, { term: 'кот', definition: 'мяукает' }] })
    await seed('Да или нет', { type: 'truefalse', questions: [{ statement: 'Земля круглая', answer: true }, { statement: 'Солнце холодное', answer: false }] })
    await seed('Скрытая', { isPublic: false })

    expect((await titles('?type=quiz')).sort()).toEqual(['Викторина А', 'Викторина Б'])
    expect(await titles('?type=matching')).toEqual(['Пары'])
  })

  it('невалидный type — 400', async () => {
    for (const query of ['?type=gaps', '?type=', '?type=QUIZ']) expect((await list(query)).status).toBe(400)
  })

  it('поиск по названию без учёта регистра, в том числе кириллицы', async () => {
    await seed('Столицы Европы')
    await seed('Реки')

    expect(await titles(`?q=${encodeURIComponent('СТОЛИЦЫ')}`)).toEqual(['Столицы Европы'])
    expect(await titles(`?q=${encodeURIComponent('европ')}`)).toEqual(['Столицы Европы'])
  })

  it('%, _ и обратная косая в поиске — буквальные символы, а не шаблоны LIKE', async () => {
    await seed('Скидка 50% на всё')
    await seed('Скидка 500 рублей')
    await seed('snake_case')
    await seed('snakeXcase')
    await seed('C:\\path')
    await seed('C:path')

    expect(await titles(`?q=${encodeURIComponent('50%')}`)).toEqual(['Скидка 50% на всё'])
    expect(await titles(`?q=${encodeURIComponent('e_c')}`)).toEqual(['snake_case'])
    expect(await titles(`?q=${encodeURIComponent(':\\p')}`)).toEqual(['C:\\path'])
  })

  it('поиск вместе с группой и страницей', async () => {
    await seed('Алгебра 7', { groupSlug: 'exact' })
    await seed('Алгебра 8')

    expect(await titles(`?group=exact&q=${encodeURIComponent('алгебра')}`)).toEqual(['Алгебра 7'])
    const empty = libraryListResponseSchema.parse(await (await list(`?q=${encodeURIComponent('алгебра')}&page=2`)).json())
    expect(empty).toEqual({ quizzes: [], page: 2, hasNext: false })
  })

  it('вопросы, не проходящие схему, не ломают список: количество считается по массиву', async () => {
    await seed('Битая', { questions: [{ broken: true }] })

    const response = await list()

    expect(response.status).toBe(200)
    expect(libraryListResponseSchema.parse(await response.json()).quizzes).toMatchObject([{ title: 'Битая', questionCount: 1 }])
  })

  it('questions не массив — рассинхрон данных: 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await seed('Не массив', { questions: { broken: true } })

    expect((await list()).status).toBe(500)
  })
})

describe('GET /api/library: превью', () => {
  async function firstItem() {
    const response = await list()
    expect(response.status).toBe(200)
    return libraryListResponseSchema.parse(await response.json()).quizzes[0]!
  }

  it('превью — по первому вопросу, даже когда вопросов больше трёх', async () => {
    const questions = [1, 2, 3, 4, 5].map((n) => ({ ...QUESTION, text: `Вопрос ${n}` }))
    await seed('Пять вопросов', { questions })

    expect((await firstItem()).thumbnail).toMatchObject({ type: 'quiz', text: 'Вопрос 1' })
  })

  it('сопоставление: в ответе нет ни одного слова', async () => {
    const pairs = [1, 2, 3, 4].map((n) => ({ term: `СЛОВО-${n}`, definition: `определение ${n}` }))
    await seed('Пары', { type: 'matching', questions: pairs })

    const response = await list()
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(text).not.toContain('СЛОВО-')
    expect(libraryListResponseSchema.parse(JSON.parse(text)).quizzes[0]!.thumbnail).toEqual({
      type: 'matching',
      definitions: ['определение 1', 'определение 2', 'определение 3'],
    })
  })

  it('задание без вопросов: превью null', async () => {
    await seed('Пустое', { questions: [] })

    expect((await firstItem()).thumbnail).toBeNull()
  })

  it('«да/нет»: только первое утверждение, без ответа', async () => {
    await seed('Да или нет', {
      type: 'truefalse',
      questions: [
        { statement: 'Земля круглая', answer: true },
        { statement: 'ВТОРОЕ-УТВЕРЖДЕНИЕ', answer: false },
      ],
    })

    const response = await list()
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(libraryListResponseSchema.parse(JSON.parse(text)).quizzes[0]!.thumbnail).toEqual({ type: 'truefalse', statement: 'Земля круглая' })
    expect(text).not.toContain('"answer"')
    expect(text).not.toContain('ВТОРОЕ-УТВЕРЖДЕНИЕ')
  })

  it('сопоставление с двумя парами: два определения', async () => {
    await seed('Две пары', { type: 'matching', questions: [{ term: 'пёс', definition: 'лает' }, { term: 'кот', definition: 'мяукает' }] })

    expect((await firstItem()).thumbnail).toEqual({ type: 'matching', definitions: ['лает', 'мяукает'] })
  })

  it('все три типа: в сыром ответе нет ни id, ни shareToken, ни teacherId, ни ответов и слов', async () => {
    const quiz = await seed('Викторина', { createdAt: fromNow(-days(1)) })
    const matching = await seed('Пары', { type: 'matching', createdAt: fromNow(-days(2)), questions: [1, 2, 3].map((n) => ({ term: `СЛОВО-${n}`, definition: `определение ${n}` })) })
    const trueFalse = await seed('Да или нет', { type: 'truefalse', createdAt: fromNow(-days(3)), questions: [{ statement: 'Земля круглая', answer: true }, { statement: 'Луна квадратная', answer: false }] })

    const response = await list()
    const text = await response.text()
    expect(response.status).toBe(200)
    // Сначала — что превью есть у всех: иначе проверки «нет в ответе» прошли бы на пустых превью
    expect(libraryListResponseSchema.parse(JSON.parse(text)).quizzes.map((item) => item.thumbnail?.type)).toEqual(['quiz', 'matching', 'truefalse'])
    for (const row of [quiz, matching, trueFalse]) {
      expect(text).not.toContain(row.id)
      expect(text).not.toContain(row.shareToken)
    }
    expect(text).not.toContain(teacherId)
    for (const key of ['"isCorrect"', '"answer"', '"term"', '"terms"', '"imageId"', '"teacherId"', '"shareToken"', '"id"']) expect(text).not.toContain(key)
    expect(text).not.toContain('СЛОВО-')
  })

  it('картинка вопроса — адрес хранилища; id картинок вариантов в ответ не уходят', async () => {
    const storage = makeMemoryImageStorage()
    const questionImage = randomUUID()
    const optionImage = randomUUID()
    await seed('С картинкой', {
      questions: [{ text: 'Кто это?', imageId: questionImage, options: [{ text: '', isCorrect: true, imageId: optionImage }, { text: 'Кот', isCorrect: false, imageId: null }] }],
    })

    const response = await list('', storage.storage)
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(libraryListResponseSchema.parse(JSON.parse(text)).quizzes[0]!.thumbnail).toEqual({
      type: 'quiz',
      text: 'Кто это?',
      imageUrl: `${MEMORY_IMAGES_BASE_URL}/quiz-images/${questionImage}.webp`,
      options: [{ text: '' }, { text: 'Кот' }],
    })
    expect(text).not.toContain(optionImage)
    expect(text).not.toContain('"imageId"')
  })

  it('хранилище не настроено: imageUrl null, id картинки в ответ не уходит', async () => {
    const questionImage = randomUUID()
    await seed('С картинкой', { questions: [{ ...QUESTION, imageId: questionImage }] })

    const response = await list()
    const text = await response.text()
    expect(libraryListResponseSchema.parse(JSON.parse(text)).quizzes[0]!.thumbnail).toMatchObject({ type: 'quiz', text: 'Вопрос', imageUrl: null })
    expect(text).not.toContain(questionImage)
  })

  it('длинные тексты всех типов обрезаются сервером: ответ проходит схему списка', async () => {
    const long = (char: string) => char.repeat(200)
    await seed('Викторина', { createdAt: fromNow(-days(1)), questions: [{ text: long('я'), imageId: null, options: [{ text: long('б').slice(0, 60), isCorrect: true, imageId: null }, { text: 'Нет', isCorrect: false, imageId: null }] }] })
    await seed('Пары', { type: 'matching', createdAt: fromNow(-days(2)), questions: [{ term: 'пёс', definition: long('о') }, { term: 'кот', definition: 'мяукает' }] })
    await seed('Да или нет', { type: 'truefalse', createdAt: fromNow(-days(3)), questions: [{ statement: long('у'), answer: true }, { statement: 'Второе', answer: false }] })

    const response = await list()
    expect(response.status).toBe(200)
    const thumbnails = libraryListResponseSchema.parse(await response.json()).quizzes.map((item) => item.thumbnail)
    const clipped = (char: string) => char.repeat(LIBRARY_THUMBNAIL_TEXT_MAX_LENGTH - 1) + '…'
    expect(thumbnails).toMatchObject([
      { type: 'quiz', text: clipped('я') },
      { type: 'matching', definitions: [clipped('о'), 'мяукает'] },
      { type: 'truefalse', statement: clipped('у') },
    ])
  })
})
