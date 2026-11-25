import { randomBytes } from 'node:crypto'
import {
  MAX_QUIZZES_PER_TEACHER,
  libraryListResponseSchema,
  libraryTakeResponseSchema,
  playActivityResponseSchema,
  quizListResponseSchema,
} from '@nataskium/shared/schemas'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuizCleanup } from '../../src/app'
import { makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher, days, fromNow } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

// Строка сопоставления (ADR-0013) появляется до его API: маршруты викторин не должны ни видеть её, ни падать на ней
const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })
const SHARE_TOKEN_BYTES = 16
const PAIRS = [
  { term: 'кот', definition: 'мяукает' },
  { term: 'пёс', definition: 'лает' },
  { term: 'корова', definition: 'мычит' },
]
const QUIZ_INPUT = {
  title: 'Столицы',
  showAnswers: true,
  gradingScale: null,
  questions: [{ text: 'Столица Франции?', options: [{ text: 'Париж', isCorrect: true }, { text: 'Рим', isCorrect: false }] }],
}

const MATCHING_INPUT = {
  title: 'Животные',
  showAnswers: true,
  gradingScale: null,
  group: 'other',
  timer: { mode: 'none' },
  pairs: PAIRS.slice(0, 2),
}
const TRUE_FALSE_INPUT = {
  title: 'Факты',
  showAnswers: true,
  gradingScale: null,
  group: 'other',
  timer: { mode: 'none' },
  items: [{ statement: 'Земля круглая', answer: true }, { statement: 'Солнце холодное', answer: false }],
}

let prisma: PrismaClient

async function seedMatching(teacherId: string, deletedAt: Date | null = null) {
  return prisma.quiz.create({
    data: {
      teacherId,
      type: 'matching',
      title: 'Животные',
      shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
      questions: PAIRS,
      deletedAt,
    },
  })
}

// Заполняет лимит строками заданного типа: лимит считает оба типа
async function fillActivities(teacherId: string, count: number, type: 'quiz' | 'matching', deletedAt: Date | null = null) {
  await prisma.quiz.createMany({
    data: Array.from({ length: count }, () => ({
      teacherId,
      type,
      title: 'Тест',
      shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
      questions: type === 'quiz' ? [] : PAIRS,
      isPublic: type === 'matching' ? true : false,
      deletedAt,
    })),
  })
}

async function seedQuiz(teacherId: string, deletedAt: Date | null) {
  return prisma.quiz.create({
    data: { teacherId, title: 'Старая', shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'), questions: [], deletedAt },
  })
}

// Новое приложение на каждый запрос: счётчики лимитов не копятся между вызовами
async function request(method: string, path: string, options: { body?: unknown; teacherId?: string } = {}) {
  const headers: Record<string, string> = { origin: TEST_WEB_ORIGIN }
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (options.teacherId !== undefined) headers.authorization = `Bearer ${await tokens.signAccessToken(options.teacherId)}`
  const init = { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }
  return createTestApp({ prisma }).request(path, init, fromIp())
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

async function seedTrueFalse(teacherId: string) {
  return prisma.quiz.create({
    data: {
      teacherId,
      type: 'truefalse',
      title: 'Факты',
      shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
      questions: [{ statement: 'Земля круглая', answer: true }, { statement: 'Солнце холодное', answer: false }],
    },
  })
}

describe('строка truefalse и маршруты других типов', () => {
  it('id truefalse на /api/quizzes/:id и /api/matchings/:id — 404, строка не изменена', async () => {
    const teacher = await createTeacher(prisma)
    const trueFalse = await seedTrueFalse(teacher.id)

    const routes = [
      ['/api/quizzes', QUIZ_INPUT],
      ['/api/matchings', MATCHING_INPUT],
    ] as const
    for (const [base, input] of routes) {
      for (const [method, body] of [['GET', undefined], ['PATCH', input], ['DELETE', undefined]] as const) {
        expect((await request(method, `${base}/${trueFalse.id}`, { teacherId: teacher.id, body })).status, `${method} ${base}`).toBe(404)
      }
    }
    expect(await prisma.quiz.findUniqueOrThrow({ where: { id: trueFalse.id } })).toMatchObject({ type: 'truefalse', title: 'Факты', deletedAt: null })
  })

  it('id викторины и сопоставления на /api/true-false/:id — 404, строки не изменены', async () => {
    const teacher = await createTeacher(prisma)
    const quiz = await seedQuiz(teacher.id, null)
    const matching = await seedMatching(teacher.id)
    const select = { title: true, questions: true } as const
    const before = [await prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id }, select }), await prisma.quiz.findUniqueOrThrow({ where: { id: matching.id }, select })]

    for (const id of [quiz.id, matching.id]) {
      for (const [method, body] of [['GET', undefined], ['PATCH', TRUE_FALSE_INPUT], ['DELETE', undefined]] as const) {
        expect((await request(method, `/api/true-false/${id}`, { teacherId: teacher.id, body })).status, `${method} ${id}`).toBe(404)
      }
    }
    expect(await prisma.quiz.count({ where: { teacherId: teacher.id, deletedAt: null } })).toBe(2)
    const after = [await prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id }, select }), await prisma.quiz.findUniqueOrThrow({ where: { id: matching.id }, select })]
    expect(after).toEqual(before)
  })
})

describe('строка matching и маршруты викторин', () => {
  it('кабинет: GET, PATCH и DELETE по id — 404, строка не изменена', async () => {
    const teacher = await createTeacher(prisma)
    const matching = await seedMatching(teacher.id)
    const path = `/api/quizzes/${matching.id}`

    expect((await request('GET', path, { teacherId: teacher.id })).status).toBe(404)
    expect((await request('PATCH', path, { teacherId: teacher.id, body: QUIZ_INPUT })).status).toBe(404)
    expect((await request('DELETE', path, { teacherId: teacher.id })).status).toBe(404)

    const row = await prisma.quiz.findUniqueOrThrow({ where: { id: matching.id } })
    expect(row).toMatchObject({ type: 'matching', title: 'Животные', deletedAt: null, questions: PAIRS })
  })

  it('кабинет: список содержит строку с type и числом пар', async () => {
    const teacher = await createTeacher(prisma)
    const matching = await seedMatching(teacher.id)

    const response = await request('GET', '/api/quizzes', { teacherId: teacher.id })

    expect(response.status).toBe(200)
    const { quizzes } = quizListResponseSchema.parse(await response.json())
    expect(quizzes).toEqual([expect.objectContaining({ id: matching.id, type: 'matching', questionCount: PAIRS.length })])
  })

  it('кабинет: викторина в списке получает type quiz', async () => {
    const teacher = await createTeacher(prisma)
    const created = await request('POST', '/api/quizzes', { teacherId: teacher.id, body: QUIZ_INPUT })
    expect(created.status).toBe(201)

    const { quizzes } = quizListResponseSchema.parse(await (await request('GET', '/api/quizzes', { teacherId: teacher.id })).json())
    expect(quizzes.map((quiz) => quiz.type)).toEqual(['quiz'])
  })

  // GET /api/play/:token отдаёт сопоставление с шага 6a; маршруты викторины по его токену — 404
  it('игра: check и finish викторины по токену сопоставления — 404', async () => {
    const teacher = await createTeacher(prisma)
    const { shareToken } = await seedMatching(teacher.id)
    const path = `/api/play/${shareToken}`

    expect((await request('POST', `${path}/check`, { body: { version: 'v1', questionIndex: 0, selected: [0] } })).status).toBe(404)
    expect((await request('POST', `${path}/finish`, { body: { version: 'v1', answers: [[0]] } })).status).toBe(404)
  })

  // Библиотека показывает оба типа: игра и «Взять себе» ветвятся по type
  it('библиотека: игра matching — 200 с type matching; «Взять себе» — непубличная копия matching', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const { publicNumber } = await seedMatching(author.id)

    const activity = playActivityResponseSchema.parse(await (await request('GET', `/api/library/play/${publicNumber}`)).json())
    expect(activity.type).toBe('matching')
    const taken = await request('POST', `/api/library/${publicNumber}/take`, { teacherId: taker.id })
    expect(taken.status).toBe(201)
    const { quizId, type } = libraryTakeResponseSchema.parse(await taken.json())
    expect(type).toBe('matching')
    expect(await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })).toMatchObject({ teacherId: taker.id, type: 'matching', isPublic: false })
  })

  it('библиотека: список содержит оба типа с type и числом пар, проходит схему', async () => {
    const author = await createTeacher(prisma)
    await seedMatching(author.id)
    await request('POST', '/api/quizzes', { teacherId: author.id, body: QUIZ_INPUT })

    const response = await request('GET', '/api/library')

    expect(response.status).toBe(200)
    const { quizzes } = libraryListResponseSchema.parse(await response.json())
    expect(quizzes.map(({ title, type, questionCount }) => ({ title, type, questionCount })).sort((a, b) => a.type.localeCompare(b.type))).toEqual([
      { title: 'Животные', type: 'matching', questionCount: PAIRS.length },
      { title: QUIZ_INPUT.title, type: 'quiz', questionCount: 1 },
    ])
  })

  it('кабинет: удалённая строка matching не попадает в список', async () => {
    const teacher = await createTeacher(prisma)
    await seedMatching(teacher.id, new Date())

    const { quizzes } = quizListResponseSchema.parse(await (await request('GET', '/api/quizzes', { teacherId: teacher.id })).json())

    expect(quizzes).toEqual([])
  })

  it('лимит 100 считает строки matching: 100-я строка любого типа — 409', async () => {
    const teacher = await createTeacher(prisma)
    await fillActivities(teacher.id, MAX_QUIZZES_PER_TEACHER - 1, 'matching')
    expect((await request('POST', '/api/quizzes', { teacherId: teacher.id, body: QUIZ_INPUT })).status).toBe(201)

    expect((await request('POST', '/api/quizzes', { teacherId: teacher.id, body: QUIZ_INPUT })).status).toBe(409)
  })

  it('лимит: удалённая строка matching в лимит не входит', async () => {
    const teacher = await createTeacher(prisma)
    await fillActivities(teacher.id, MAX_QUIZZES_PER_TEACHER - 1, 'matching')
    await seedMatching(teacher.id, new Date())

    expect((await request('POST', '/api/quizzes', { teacherId: teacher.id, body: QUIZ_INPUT })).status).toBe(201)
  })

  it('игра: ответ на токен matching неотличим от несуществующего токена', async () => {
    const teacher = await createTeacher(prisma)
    const { shareToken } = await seedMatching(teacher.id)
    const body = { version: 'v1', questionIndex: 0, selected: [0] }

    const missingToken = randomBytes(SHARE_TOKEN_BYTES).toString('base64url')

    const real = await request('POST', `/api/play/${shareToken}/check`, { body })
    const missing = await request('POST', `/api/play/${missingToken}/check`, { body })

    expect(real.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await real.json()).toEqual(await missing.json())
  })

  it('библиотека: игры викторины и matching открываются, у каждой свой type', async () => {
    const author = await createTeacher(prisma)
    const quiz = await prisma.quiz.create({
      data: { teacherId: author.id, title: 'Квиз', shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'), showAnswers: true, questions: QUIZ_INPUT.questions, isPublic: true },
    })
    const matching = await seedMatching(author.id)

    const quizPlay = playActivityResponseSchema.parse(await (await request('GET', `/api/library/play/${quiz.publicNumber}`)).json())
    const matchingPlay = playActivityResponseSchema.parse(await (await request('GET', `/api/library/play/${matching.publicNumber}`)).json())
    expect([quizPlay.type, matchingPlay.type]).toEqual(['quiz', 'matching'])
  })

  it('«Взять себе» matching тратит общий лимит: 99 викторин + копия matching — 201, следующая — 409', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const matching = await seedMatching(author.id)
    await fillActivities(taker.id, MAX_QUIZZES_PER_TEACHER - 1, 'quiz')

    expect((await request('POST', `/api/library/${matching.publicNumber}/take`, { teacherId: taker.id })).status).toBe(201)
    expect((await request('POST', `/api/library/${matching.publicNumber}/take`, { teacherId: taker.id })).status).toBe(409)
    expect(await prisma.quiz.count({ where: { teacherId: taker.id, deletedAt: null } })).toBe(MAX_QUIZZES_PER_TEACHER)
  })

  it('purge удаляет просроченные строки обоих типов', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const teacher = await createTeacher(prisma)
    await seedMatching(teacher.id, fromNow(-days(31)))
    await seedQuiz(teacher.id, fromNow(-days(31)))

    await createQuizCleanup(prisma)()

    expect(await prisma.quiz.count()).toBe(0)
  })
})
