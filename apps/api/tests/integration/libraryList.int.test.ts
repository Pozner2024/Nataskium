import { randomBytes } from 'node:crypto'
import { LIBRARY_PAGE_SIZE, libraryListResponseSchema } from '@nataskium/shared/schemas'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client'
import { TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher, days, fromNow } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const LIBRARY = '/api/library'
const SUMMARY_KEYS = ['createdAt', 'graded', 'groupSlug', 'number', 'questionCount', 'title', 'type']
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

type SeedOptions = Partial<Pick<Prisma.QuizUncheckedCreateInput, 'isPublic' | 'deletedAt' | 'moderationHiddenAt' | 'gradingScale' | 'groupSlug' | 'createdAt'>> & {
  questions?: Prisma.InputJsonValue
}

async function seed(title: string, options: SeedOptions = {}) {
  const { questions = [QUESTION], ...rest } = options
  return prisma.quiz.create({
    data: { teacherId, title, shareToken: randomBytes(16).toString('base64url'), questions, ...rest },
  })
}

function list(query = '') {
  return createTestApp({ prisma }).request(`${LIBRARY}${query}`, { headers: { origin: TEST_WEB_ORIGIN } }, fromIp())
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
