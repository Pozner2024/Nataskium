import { randomBytes } from 'node:crypto'
import {
  MAX_ACTIVITIES_PER_TEACHER,
  libraryListResponseSchema,
  libraryTakeResponseSchema,
  matchingResponseSchema,
  playActivityResponseSchema,
} from '@nataskium/shared/schemas'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })
const SHARE_TOKEN_BYTES = 16
const PAIRS = Array.from({ length: 8 }, (_, i) => ({ term: `слово ${i}`, definition: `определение ${i}` }))

let prisma: PrismaClient

async function seedMatching(teacherId: string, title = 'Животные') {
  return prisma.quiz.create({
    data: {
      teacherId,
      type: 'matching',
      title,
      shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
      showAnswers: false,
      gradingScale: 'five',
      timerMode: 'stopwatch',
      questions: PAIRS,
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

describe('библиотека: сопоставление', () => {
  it('список содержит оба типа с type; у сопоставления questionCount — число пар', async () => {
    const author = await createTeacher(prisma)
    await seedQuizzes(author.id, 1)
    await seedMatching(author.id)

    const { quizzes } = libraryListResponseSchema.parse(await (await request('GET', '/api/library')).json())

    expect(quizzes.map(({ type, questionCount }) => ({ type, questionCount })).sort((a, b) => a.type.localeCompare(b.type))).toEqual([
      { type: 'matching', questionCount: PAIRS.length },
      { type: 'quiz', questionCount: 1 },
    ])
  })

  it('игра из библиотеки: все определения по порядку, все слова, без связи пар и служебных полей', async () => {
    const author = await createTeacher(prisma)
    const row = await seedMatching(author.id)

    const text = await (await request('GET', `/api/library/play/${row.publicNumber}`)).text()
    const activity = playActivityResponseSchema.parse(JSON.parse(text))

    if (activity.type !== 'matching') throw new Error('expected matching')
    expect(activity.matching.definitions).toEqual(PAIRS.map((pair) => pair.definition))
    expect([...activity.matching.terms].sort()).toEqual(PAIRS.map((pair) => pair.term).sort())
    expect(Object.keys(activity.matching).sort()).toEqual(['definitions', 'introTheme', 'showAnswers', 'terms', 'timer', 'title', 'version'])
    for (const leak of ['pairs', 'term"', 'definition"', 'correct', 'shareToken', row.id, row.shareToken, author.id]) expect(text).not.toContain(leak)
  })

  it('карточки задания больше нет: GET /api/library/<номер> — 404', async () => {
    const author = await createTeacher(prisma)
    const row = await seedMatching(author.id)

    expect((await request('GET', `/api/library/${row.publicNumber}`)).status).toBe(404)
  })

  it('«Взять себе»: копия учителя непубличная, с теми же парами и настройками, в библиотеке не появляется', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const source = await seedMatching(author.id)

    const response = await request('POST', `/api/library/${source.publicNumber}/take`, taker.id)

    expect(response.status).toBe(201)
    const { quizId, type } = libraryTakeResponseSchema.parse(await response.json())
    expect(type).toBe('matching')
    const copy = await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })
    expect(copy).toMatchObject({ teacherId: taker.id, type: 'matching', isPublic: false, timerMode: 'stopwatch', gradingScale: 'five', questions: PAIRS })
    expect(copy.shareToken).not.toBe(source.shareToken)

    const got = matchingResponseSchema.parse(await (await request('GET', `/api/matchings/${quizId}`, taker.id)).json())
    expect(got.matching.pairs).toEqual(PAIRS)
    const { quizzes } = libraryListResponseSchema.parse(await (await request('GET', '/api/library')).json())
    expect(quizzes.map((quiz) => quiz.number)).toEqual([source.publicNumber])
  })

  it(`«Взять себе»: лимит ${MAX_ACTIVITIES_PER_TEACHER} общий — при полном лимите 409, копия не создана`, async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const source = await seedMatching(author.id)
    await seedQuizzes(taker.id, MAX_ACTIVITIES_PER_TEACHER)

    expect((await request('POST', `/api/library/${source.publicNumber}/take`, taker.id)).status).toBe(409)
    expect(await prisma.quiz.count({ where: { teacherId: taker.id, type: 'matching' } })).toBe(0)
  })

  it('непубличное и скрытое модерацией сопоставление — игра и «Взять себе» 404, в списке не видно', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const unpublished = await prisma.quiz.create({
      data: { teacherId: author.id, type: 'matching', title: 'Непубличное', shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'), gradingScale: 'five', questions: PAIRS, isPublic: false },
    })
    const hidden = await prisma.quiz.create({
      data: { teacherId: author.id, type: 'matching', title: 'Скрытое', shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'), gradingScale: 'five', questions: PAIRS, moderationHiddenAt: new Date() },
    })

    for (const row of [unpublished, hidden]) {
      expect((await request('GET', `/api/library/play/${row.publicNumber}`)).status).toBe(404)
      expect((await request('POST', `/api/library/${row.publicNumber}/take`, taker.id)).status).toBe(404)
    }
    expect(await prisma.quiz.count({ where: { teacherId: taker.id } })).toBe(0)
    const { quizzes } = libraryListResponseSchema.parse(await (await request('GET', '/api/library')).json())
    expect(quizzes).toEqual([])
  })

  it('поиск по названию находит сопоставление; чужой запрос — пусто', async () => {
    const author = await createTeacher(prisma)
    const source = await seedMatching(author.id, 'Животные и звуки')

    const found = libraryListResponseSchema.parse(await (await request('GET', '/api/library?q=звуки')).json())
    expect(found.quizzes.map((quiz) => quiz.number)).toEqual([source.publicNumber])
    expect(found.quizzes[0]).toMatchObject({ type: 'matching', questionCount: PAIRS.length })

    const missed = libraryListResponseSchema.parse(await (await request('GET', '/api/library?q=растения')).json())
    expect(missed.quizzes).toEqual([])
  })

  it('копия сопоставления не появляется в библиотеке, и после правки копии тоже', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const source = await seedMatching(author.id)
    const { quizId } = libraryTakeResponseSchema.parse(await (await request('POST', `/api/library/${source.publicNumber}/take`, taker.id)).json())

    const patched = await createTestApp({ prisma }).request(
      `/api/matchings/${quizId}`,
      {
        method: 'PATCH',
        headers: { origin: TEST_WEB_ORIGIN, authorization: `Bearer ${await tokens.signAccessToken(taker.id)}`, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Изменено', showAnswers: true, gradingScale: 'ten', group: 'other', timer: { mode: 'none' }, pairs: PAIRS }),
      },
      fromIp(),
    )
    expect(patched.status).toBe(200)

    const { quizzes } = libraryListResponseSchema.parse(await (await request('GET', '/api/library')).json())
    expect(quizzes.map((quiz) => quiz.number)).toEqual([source.publicNumber])
    expect((await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })).isPublic).toBe(false)
  })

  it('«Взять себе» своего сопоставления: копия создаётся непубличной, в библиотеке остаётся один оригинал', async () => {
    const author = await createTeacher(prisma)
    const source = await seedMatching(author.id)

    const response = await request('POST', `/api/library/${source.publicNumber}/take`, author.id)

    expect(response.status).toBe(201)
    const { quizId } = libraryTakeResponseSchema.parse(await response.json())
    expect((await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })).isPublic).toBe(false)
    const { quizzes } = libraryListResponseSchema.parse(await (await request('GET', '/api/library')).json())
    expect(quizzes.map((quiz) => quiz.number)).toEqual([source.publicNumber])
  })

  it('сопоставление, скрытое модерацией: игра и «Взять себе» 404 с тем же ответом, что и несуществующий номер, копия не создана', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const hidden = await prisma.quiz.create({
      data: {
        teacherId: author.id,
        type: 'matching',
        title: 'Скрытое модерацией',
        shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
        gradingScale: 'five',
        questions: PAIRS,
        moderationHiddenAt: new Date(),
      },
    })
    const missingNumber = hidden.publicNumber + 1000

    const reference = await request('GET', `/api/library/play/${missingNumber}`)
    const card = await request('GET', `/api/library/play/${hidden.publicNumber}`)
    const takeHidden = await request('POST', `/api/library/${hidden.publicNumber}/take`, taker.id)
    const takeMissing = await request('POST', `/api/library/${missingNumber}/take`, taker.id)

    expect(card.status).toBe(404)
    expect(takeHidden.status).toBe(404)
    expect(await card.text()).toBe(await reference.text())
    expect(await takeHidden.text()).toBe(await takeMissing.text())
    expect(await prisma.quiz.count({ where: { teacherId: taker.id } })).toBe(0)
  })

  it('автор удалил аккаунт — игра и «Взять себе» 404', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const source = await seedMatching(author.id)
    await prisma.teacher.delete({ where: { id: author.id } })

    expect((await request('GET', `/api/library/play/${source.publicNumber}`)).status).toBe(404)
    expect((await request('POST', `/api/library/${source.publicNumber}/take`, taker.id)).status).toBe(404)
    expect(await prisma.quiz.count({ where: { teacherId: taker.id } })).toBe(0)
  })
})
