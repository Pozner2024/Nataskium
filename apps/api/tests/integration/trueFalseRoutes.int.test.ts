import { randomBytes, randomUUID } from 'node:crypto'
import { MAX_ACTIVITIES_PER_TEACHER, type TrueFalseInput, apiErrorResponseSchema, quizListResponseSchema, trueFalseResponseSchema } from '@nataskium/shared/schemas'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })
const BASE = '/api/true-false'
const SHARE_TOKEN_BYTES = 16
const INPUT: TrueFalseInput = {
  title: 'Факты',
  showAnswers: true,
  gradingScale: 'five',
  group: 'other',
  timer: { mode: 'none' },
  items: [
    { statement: 'Земля круглая', answer: true },
    { statement: 'Солнце холодное', answer: false },
    { statement: 'Вода мокрая', answer: true },
  ],
}

let prisma: PrismaClient

// Новое приложение на каждый запрос: счётчики лимитов не копятся между вызовами
async function request(method: string, path: string, options: { body?: unknown; teacherId?: string } = {}) {
  const headers: Record<string, string> = { origin: TEST_WEB_ORIGIN }
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (options.teacherId !== undefined) headers.authorization = `Bearer ${await tokens.signAccessToken(options.teacherId)}`
  const init = { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }
  return createTestApp({ prisma }).request(path, init, fromIp())
}

async function createTrueFalse(teacherId: string, input: unknown = INPUT) {
  const response = await request('POST', BASE, { teacherId, body: input })
  expect(response.status).toBe(201)
  return trueFalseResponseSchema.parse(await response.json()).trueFalse
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

describe('/api/true-false', () => {
  it('без токена — 401 на всех маршрутах', async () => {
    const id = randomUUID()
    for (const [method, path, body] of [
      ['POST', BASE, INPUT],
      ['GET', `${BASE}/${id}`, undefined],
      ['PATCH', `${BASE}/${id}`, INPUT],
      ['DELETE', `${BASE}/${id}`, undefined],
    ] as const) {
      expect((await request(method, path, { body })).status).toBe(401)
    }
  })

  it('создание и чтение: GET возвращает утверждения с answer, без служебных полей', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createTrueFalse(teacher.id)
    expect(created).toMatchObject({ title: INPUT.title, items: INPUT.items, timer: INPUT.timer, group: 'other' })

    const response = await request('GET', `${BASE}/${created.id}`, { teacherId: teacher.id })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { trueFalse: Record<string, unknown> }
    expect(trueFalseResponseSchema.parse(body).trueFalse).toEqual(created)
    expect(Object.keys(body.trueFalse).sort()).toEqual(['gradingScale', 'group', 'id', 'items', 'shareToken', 'showAnswers', 'timer', 'title'])
    expect(await prisma.quiz.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ type: 'truefalse', isPublic: true })
  })

  it('изменение и удаление', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createTrueFalse(teacher.id)
    const changed = { ...INPUT, title: 'Новое', items: INPUT.items.slice(0, 2) }

    const patched = await request('PATCH', `${BASE}/${created.id}`, { teacherId: teacher.id, body: changed })
    expect(patched.status).toBe(200)
    expect(trueFalseResponseSchema.parse(await patched.json()).trueFalse).toMatchObject({ id: created.id, title: 'Новое', items: changed.items })

    expect((await request('DELETE', `${BASE}/${created.id}`, { teacherId: teacher.id })).status).toBe(204)
    expect((await request('GET', `${BASE}/${created.id}`, { teacherId: teacher.id })).status).toBe(404)
  })

  it('400: одно утверждение — путь items', async () => {
    const teacher = await createTeacher(prisma)

    const response = await request('POST', BASE, { teacherId: teacher.id, body: { ...INPUT, items: [INPUT.items[0]] } })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { issues?: { path: string[] }[] }
    expect((body.issues ?? []).map((issue) => issue.path.join('.'))).toEqual(['items'])
    expect(await prisma.quiz.count()).toBe(0)
  })

  it(`409: лимит ${MAX_ACTIVITIES_PER_TEACHER} общий с заданиями других типов, удалённые не считаются`, async () => {
    const teacher = await createTeacher(prisma)
    const matching = (deletedAt: Date | null = null) => ({
      teacherId: teacher.id,
      type: 'matching',
      title: 'Другое',
      shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
      questions: [{ term: 'кот', definition: 'мяукает' }, { term: 'пёс', definition: 'лает' }],
      deletedAt,
    })
    await prisma.quiz.createMany({ data: Array.from({ length: MAX_ACTIVITIES_PER_TEACHER }, () => matching()) })
    await prisma.quiz.createMany({ data: [matching(new Date())] })

    const over = await request('POST', BASE, { teacherId: teacher.id, body: INPUT })

    expect(over.status).toBe(409)
    expect(await prisma.quiz.count({ where: { teacherId: teacher.id, deletedAt: null } })).toBe(MAX_ACTIVITIES_PER_TEACHER)
  })

  it('GET /api/quizzes содержит задание с type truefalse и questionCount по числу утверждений', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createTrueFalse(teacher.id)

    const { quizzes } = quizListResponseSchema.parse(await (await request('GET', '/api/quizzes', { teacherId: teacher.id })).json())

    expect(quizzes).toEqual([
      { id: created.id, type: 'truefalse', title: INPUT.title, questionCount: INPUT.items.length, gradingScale: 'five', shareToken: created.shareToken },
    ])
  })

  it('404 одинаковый: невалидный id, несуществующий, чужой и id викторины', async () => {
    const owner = await createTeacher(prisma)
    const stranger = await createTeacher(prisma)
    const own = await createTrueFalse(owner.id)
    const quiz = await prisma.quiz.create({
      data: { teacherId: owner.id, title: 'Викторина', shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'), questions: [] },
    })
    const cases: [string, string][] = [
      [owner.id, 'not-a-uuid'],
      [owner.id, randomUUID()],
      [stranger.id, own.id],
      [owner.id, quiz.id],
    ]

    for (const [teacherId, id] of cases) {
      for (const [method, body] of [['GET', undefined], ['PATCH', INPUT], ['DELETE', undefined]] as const) {
        const response = await request(method, `${BASE}/${id}`, { teacherId, body })
        expect(response.status, `${method} ${id}`).toBe(404)
        expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('True/false activity not found')
      }
    }
    expect(await prisma.quiz.findUniqueOrThrow({ where: { id: own.id } })).toMatchObject({ title: INPUT.title, deletedAt: null })
  })
})
