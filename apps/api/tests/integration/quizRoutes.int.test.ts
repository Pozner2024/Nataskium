import { randomBytes, randomUUID } from 'node:crypto'
import {
  MAX_QUIZZES_PER_TEACHER,
  type QuizInput,
  quizListResponseSchema,
  quizResponseSchema,
} from '@nataskium/shared/schemas'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeQuizRepository } from '../../src/features/quizzes'
import { makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })
const BASE = '/api/quizzes'
const HIEROGLYPH = '我'
const MAX_QUESTIONS = 50
const MAX_QUESTION_TEXT = 200
const MAX_OPTION_TEXT = 60
const MAX_OPTIONS = 6

const INPUT: QuizInput = {
  title: 'Столицы',
  showAnswers: true,
  gradingScale: null,
  questions: [
    {
      text: 'Столица Франции?',
      options: [
        { text: 'Париж', isCorrect: true },
        { text: 'Рим', isCorrect: false },
      ],
    },
  ],
}

let prisma: PrismaClient
const app = () => createTestApp({ prisma })

async function auth(teacherId: string) {
  return { authorization: `Bearer ${await tokens.signAccessToken(teacherId)}` }
}

function call(method: string, path: string, headers: Record<string, string>, body?: unknown) {
  return app().request(
    `${BASE}${path === '/' ? '' : path}`,
    {
      method,
      headers: { origin: TEST_WEB_ORIGIN, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    fromIp(),
  )
}

async function createQuiz(headers: Record<string, string>, input: QuizInput = INPUT) {
  const response = await call('POST', '/', headers, input)
  return quizResponseSchema.parse(await response.json()).quiz
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

describe('/api/quizzes', () => {
  it('без токена — 401 на всех маршрутах', async () => {
    const id = randomUUID()
    for (const [method, path] of [['GET', '/'], ['POST', '/'], ['GET', `/${id}`], ['PATCH', `/${id}`], ['DELETE', `/${id}`]]) {
      expect((await call(method as string, path as string, {}, method === 'GET' || method === 'DELETE' ? undefined : INPUT)).status).toBe(401)
    }
  })

  it('невалидное тело — 400 с issues', async () => {
    const teacher = await createTeacher(prisma)
    const response = await call('POST', '/', await auth(teacher.id), { ...INPUT, title: '' })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { issues: unknown[] }).issues.length).toBeGreaterThan(0)
  })

  it('создание — 201, ответ проходит схему, затем список и чтение', async () => {
    const teacher = await createTeacher(prisma)
    const headers = await auth(teacher.id)
    const response = await call('POST', '/', headers, { ...INPUT, gradingScale: 'five' })
    expect(response.status).toBe(201)
    const { quiz } = quizResponseSchema.parse(await response.json())

    const list = quizListResponseSchema.parse(await (await call('GET', '/', headers)).json())
    expect(list.quizzes).toEqual([
      { id: quiz.id, title: 'Столицы', questionCount: 1, gradingScale: 'five', shareToken: quiz.shareToken },
    ])
    const got = quizResponseSchema.parse(await (await call('GET', `/${quiz.id}`, headers)).json())
    expect(got.quiz).toEqual(quiz)
  })

  it('101-я викторина учителя — 409, удалённые не считаются', async () => {
    const teacher = await createTeacher(prisma)
    const headers = await auth(teacher.id)
    await prisma.quiz.createMany({
      data: Array.from({ length: MAX_QUIZZES_PER_TEACHER }, () => ({
        teacherId: teacher.id,
        shareToken: randomBytes(16).toString('base64url'),
        title: 'Тест',
        showAnswers: true,
        gradingScale: null,
        questions: INPUT.questions,
      })),
    })
    expect((await call('POST', '/', headers, INPUT)).status).toBe(409)

    const [first] = quizListResponseSchema.parse(await (await call('GET', '/', headers)).json()).quizzes
    expect((await call('DELETE', `/${first!.id}`, headers)).status).toBe(204)
    expect((await call('POST', '/', headers, INPUT)).status).toBe(201)
  })

  it('PATCH заменяет тело целиком', async () => {
    const teacher = await createTeacher(prisma)
    const headers = await auth(teacher.id)
    const quiz = await createQuiz(headers)
    const response = await call('PATCH', `/${quiz.id}`, headers, { ...INPUT, title: 'Новое', showAnswers: false })
    expect(response.status).toBe(200)
    const updated = quizResponseSchema.parse(await response.json()).quiz
    expect(updated).toMatchObject({ id: quiz.id, title: 'Новое', showAnswers: false, shareToken: quiz.shareToken })
  })

  it('учитель Б не видит викторину учителя А: 404 на GET, PATCH, DELETE; в списке пусто', async () => {
    const a = await auth((await createTeacher(prisma)).id)
    const b = await auth((await createTeacher(prisma)).id)
    const quiz = await createQuiz(a)
    expect((await call('GET', `/${quiz.id}`, b)).status).toBe(404)
    expect((await call('PATCH', `/${quiz.id}`, b, INPUT)).status).toBe(404)
    expect((await call('DELETE', `/${quiz.id}`, b)).status).toBe(404)
    expect(quizListResponseSchema.parse(await (await call('GET', '/', b)).json()).quizzes).toEqual([])
    expect((await call('GET', `/${quiz.id}`, a)).status).toBe(200)
  })

  it('DELETE — 204, затем GET 404, в списке нет', async () => {
    const headers = await auth((await createTeacher(prisma)).id)
    const quiz = await createQuiz(headers)
    expect((await call('DELETE', `/${quiz.id}`, headers)).status).toBe(204)
    expect((await call('GET', `/${quiz.id}`, headers)).status).toBe(404)
    expect((await call('DELETE', `/${quiz.id}`, headers)).status).toBe(404)
    expect(quizListResponseSchema.parse(await (await call('GET', '/', headers)).json()).quizzes).toEqual([])
  })

  it('невалидный :id — 404, не 400', async () => {
    const headers = await auth((await createTeacher(prisma)).id)
    expect((await call('GET', '/not-a-uuid', headers)).status).toBe(404)
    expect((await call('PATCH', '/not-a-uuid', headers, INPUT)).status).toBe(404)
    expect((await call('DELETE', '/not-a-uuid', headers)).status).toBe(404)
  })

  it('максимальная викторина (50 × вопрос 200 + 6 × 60 символов «我») укладывается в лимит тела — 201', async () => {
    const headers = await auth((await createTeacher(prisma)).id)
    const question = {
      text: HIEROGLYPH.repeat(MAX_QUESTION_TEXT),
      options: Array.from({ length: MAX_OPTIONS }, (_, i) => ({ text: HIEROGLYPH.repeat(MAX_OPTION_TEXT), isCorrect: i === 0 })),
    }
    const input: QuizInput = { ...INPUT, questions: Array.from({ length: MAX_QUESTIONS }, () => question) }
    const response = await call('POST', '/', headers, input)
    expect(response.status).toBe(201)
    expect(quizResponseSchema.parse(await response.json()).quiz.questions).toHaveLength(MAX_QUESTIONS)
  })

  it('рассинхрон questions в БД — 500, не 400', async () => {
    const teacher = await createTeacher(prisma)
    const headers = await auth(teacher.id)
    const quiz = await prisma.quiz.create({
      data: { teacherId: teacher.id, title: 'Битая', shareToken: randomUUID().replaceAll('-', '').slice(0, 22), questions: [{ broken: true }] },
    })
    expect((await call('GET', `/${quiz.id}`, headers)).status).toBe(500)
  })
})

describe('quizRepository.findByShareToken', () => {
  it('находит по токену, удалённую не находит', async () => {
    const teacher = await createTeacher(prisma)
    const repository = makeQuizRepository(prisma)
    const created = await repository.create(teacher.id, INPUT, 'A'.repeat(22))
    expect(created).not.toBeNull()
    expect((await repository.findByShareToken('A'.repeat(22)))?.title).toBe('Столицы')
    expect(await repository.findByShareToken('B'.repeat(22))).toBeNull()

    await repository.softDeleteOwned(created?.id ?? '', teacher.id)
    expect(await repository.findByShareToken('A'.repeat(22))).toBeNull()
  })

  it('create при занятом токене возвращает null', async () => {
    const teacher = await createTeacher(prisma)
    const repository = makeQuizRepository(prisma)
    await repository.create(teacher.id, INPUT, 'A'.repeat(22))
    expect(await repository.create(teacher.id, INPUT, 'A'.repeat(22))).toBeNull()
  })
})
