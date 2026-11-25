import { randomBytes } from 'node:crypto'
import {
  MAX_ACTIVITIES_PER_TEACHER,
  libraryListResponseSchema,
  libraryTakeResponseSchema,
  playActivityResponseSchema,
  trueFalseResponseSchema,
} from '@nataskium/shared/schemas'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })
const SHARE_TOKEN_BYTES = 16
const ITEMS = [
  { statement: 'Земля круглая', answer: true },
  { statement: 'Солнце холодное', answer: false },
  { statement: 'Вода мокрая', answer: true },
]

let prisma: PrismaClient

async function seedTrueFalse(teacherId: string, overrides: { title?: string; isPublic?: boolean; moderationHiddenAt?: Date; deletedAt?: Date } = {}) {
  return prisma.quiz.create({
    data: {
      teacherId,
      type: 'truefalse',
      title: overrides.title ?? 'Факты',
      shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
      showAnswers: true,
      gradingScale: 'five',
      timerMode: 'stopwatch',
      questions: ITEMS,
      ...overrides,
    },
  })
}

async function seedQuizzes(teacherId: string, count: number) {
  await prisma.quiz.createMany({
    data: Array.from({ length: count }, () => ({
      teacherId,
      title: 'Викторина',
      shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
      questions: [{ text: 'Q', imageId: null, options: [{ text: 'a', isCorrect: true, imageId: null }, { text: 'b', isCorrect: false, imageId: null }] }],
    })),
  })
}

// Новое приложение на каждый запрос: счётчики лимитов не копятся между вызовами
async function request(method: string, path: string, teacherId?: string) {
  const headers: Record<string, string> = { origin: TEST_WEB_ORIGIN }
  if (teacherId !== undefined) headers.authorization = `Bearer ${await tokens.signAccessToken(teacherId)}`
  return createTestApp({ prisma }).request(path, { method, headers }, fromIp())
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('библиотека: да/нет', () => {
  it('список содержит type и questionCount — число утверждений', async () => {
    const author = await createTeacher(prisma)
    await seedTrueFalse(author.id)

    const { quizzes } = libraryListResponseSchema.parse(await (await request('GET', '/api/library')).json())

    expect(quizzes.map(({ type, questionCount }) => ({ type, questionCount }))).toEqual([{ type: 'truefalse', questionCount: ITEMS.length }])
  })

  it('игра из библиотеки: утверждения по порядку, без ответов и служебных полей', async () => {
    const author = await createTeacher(prisma)
    const row = await seedTrueFalse(author.id)

    const text = await (await request('GET', `/api/library/play/${row.publicNumber}`)).text()
    const activity = playActivityResponseSchema.parse(JSON.parse(text))

    if (activity.type !== 'truefalse') throw new Error('expected truefalse')
    expect(activity.trueFalse.statements).toEqual(ITEMS.map((item) => item.statement))
    expect(Object.keys(activity.trueFalse).sort()).toEqual(['introTheme', 'showAnswers', 'statements', 'timer', 'title', 'version'])
    for (const leak of ['answer', 'correct', 'shareToken', row.id, row.shareToken, author.id]) expect(text).not.toContain(leak)
  })

  it('«Взять себе»: копия учителя непубличная, с теми же утверждениями и ответами, в библиотеке не появляется', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const source = await seedTrueFalse(author.id)

    const response = await request('POST', `/api/library/${source.publicNumber}/take`, taker.id)

    expect(response.status).toBe(201)
    const { quizId, type } = libraryTakeResponseSchema.parse(await response.json())
    expect(type).toBe('truefalse')
    const copy = await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })
    expect(copy).toMatchObject({ teacherId: taker.id, type: 'truefalse', isPublic: false, timerMode: 'stopwatch', gradingScale: 'five', questions: ITEMS })
    expect(copy.shareToken).not.toBe(source.shareToken)

    const got = trueFalseResponseSchema.parse(await (await request('GET', `/api/true-false/${quizId}`, taker.id)).json())
    expect(got.trueFalse.items).toEqual(ITEMS)
    const { quizzes } = libraryListResponseSchema.parse(await (await request('GET', '/api/library')).json())
    expect(quizzes.map((quiz) => quiz.number)).toEqual([source.publicNumber])
  })

  it(`«Взять себе»: лимит ${MAX_ACTIVITIES_PER_TEACHER} общий — при полном лимите 409, копия не создана`, async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const source = await seedTrueFalse(author.id)
    await seedQuizzes(taker.id, MAX_ACTIVITIES_PER_TEACHER)

    expect((await request('POST', `/api/library/${source.publicNumber}/take`, taker.id)).status).toBe(409)
    expect(await prisma.quiz.count({ where: { teacherId: taker.id, type: 'truefalse' } })).toBe(0)
  })

  it('непубличное, скрытое модерацией и удалённое — игра и «Взять себе» 404, в списке не видно', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const rows = [
      await seedTrueFalse(author.id, { isPublic: false }),
      await seedTrueFalse(author.id, { moderationHiddenAt: new Date() }),
      await seedTrueFalse(author.id, { deletedAt: new Date() }),
    ]

    for (const row of rows) {
      expect((await request('GET', `/api/library/play/${row.publicNumber}`)).status).toBe(404)
      expect((await request('POST', `/api/library/${row.publicNumber}/take`, taker.id)).status).toBe(404)
    }
    expect(await prisma.quiz.count({ where: { teacherId: taker.id } })).toBe(0)
    const { quizzes } = libraryListResponseSchema.parse(await (await request('GET', '/api/library')).json())
    expect(quizzes).toEqual([])
  })
})
