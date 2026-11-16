import { randomUUID } from 'node:crypto'
import {
  type PlayCheckResponse,
  type PlayFinishResponse,
  type PlayQuizResponse,
  type QuizInput,
  playCheckResponseSchema,
  playFinishResponseSchema,
  playQuizResponseSchema,
  quizResponseSchema,
} from '@nataskium/shared/schemas'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { MEMORY_IMAGES_BASE_URL, makeMemoryImageStorage } from '../fakes/memoryImageStorage'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })
const GET_LIMIT = 120
const FINISH_LIMIT = 120
const NOT_FOUND = 404
const CONFLICT = 409
const BAD_REQUEST = 400
const TOO_MANY_REQUESTS = 429
const UNKNOWN_TOKEN = 'zzzzzzzzzzzzzzzzzzzzzz'

const INPUT: QuizInput = {
  title: 'Тест',
  showAnswers: true,
  gradingScale: 'five',
  group: 'other',
  questions: [
    {
      text: 'Столица Франции?',
      imageId: null,
      options: [
        { text: 'Рим', isCorrect: false, imageId: null },
        { text: 'Париж', isCorrect: true, imageId: null },
      ],
    },
    {
      text: 'Простые числа?',
      imageId: null,
      options: [
        { text: '2', isCorrect: true, imageId: null },
        { text: '4', isCorrect: false, imageId: null },
        { text: '5', isCorrect: true, imageId: null },
      ],
    },
  ],
}

let prisma: PrismaClient
let app: ReturnType<typeof createTestApp>
let authHeader: Record<string, string>

function request(method: string, path: string, body?: unknown, remoteAddress?: string) {
  return app.request(
    path,
    {
      method,
      headers: {
        origin: TEST_WEB_ORIGIN,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    fromIp(remoteAddress),
  )
}

async function createQuiz(input: QuizInput = INPUT) {
  const response = await app.request(
    '/api/quizzes',
    { method: 'POST', headers: { origin: TEST_WEB_ORIGIN, 'content-type': 'application/json', ...authHeader }, body: JSON.stringify(input) },
    fromIp(),
  )
  return quizResponseSchema.parse(await response.json()).quiz
}

async function loadPlay(shareToken: string): Promise<PlayQuizResponse['quiz']> {
  const response = await request('GET', `/api/play/${shareToken}`)
  expect(response.status).toBe(200)
  return playQuizResponseSchema.parse(await response.json()).quiz
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})
beforeEach(async () => {
  await truncateAll(prisma)
  app = createTestApp({ prisma })
  const teacher = await createTeacher(prisma)
  authHeader = { authorization: `Bearer ${await tokens.signAccessToken(teacher.id)}` }
})
afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('/api/play: режим «показывать»', () => {
  it('GET отдаёт вопросы без isCorrect, check возвращает правильные, finish считает', async () => {
    const created = await createQuiz()
    const response = await request('GET', `/api/play/${created.shareToken}`)
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(text).not.toContain('isCorrect')
    const quiz = playQuizResponseSchema.parse(JSON.parse(text)).quiz
    expect(quiz.questions.map((q) => q.selectCount)).toEqual([1, 2])

    const check = await request('POST', `/api/play/${created.shareToken}/check`, { version: quiz.version, questionIndex: 1, selected: [0, 1] })
    expect(check.status).toBe(200)
    const checked: PlayCheckResponse = playCheckResponseSchema.parse(await check.json())
    expect(checked.correct).toEqual([0, 2])

    const finish = await request('POST', `/api/play/${created.shareToken}/finish`, { version: quiz.version, answers: [[1], [0, 1]] })
    expect(finish.status).toBe(200)
    const finished: PlayFinishResponse = playFinishResponseSchema.parse(await finish.json())
    expect(finished.result).toEqual({ percent: 75, grade: '4', correctCount: 1, partialCount: 1, totalCount: 2 })
  })

  it('ничего не пишет в базу', async () => {
    const created = await createQuiz()
    const quiz = await loadPlay(created.shareToken)
    const before = await prisma.quiz.findMany()
    await request('POST', `/api/play/${created.shareToken}/finish`, { version: quiz.version, answers: [[1], [0, 2]] })
    expect(await prisma.quiz.findMany()).toEqual(before)
  })
})

describe('/api/play: режим «скрывать»', () => {
  it('GET и finish не содержат индексов правильных, check — 404', async () => {
    const created = await createQuiz({ ...INPUT, showAnswers: false })
    const getResponse = await request('GET', `/api/play/${created.shareToken}`)
    const getText = await getResponse.text()
    expect(getText).not.toContain('isCorrect')
    expect(getText).not.toContain('correct')
    const quiz = playQuizResponseSchema.parse(JSON.parse(getText)).quiz

    const check = await request('POST', `/api/play/${created.shareToken}/check`, { version: quiz.version, questionIndex: 0, selected: [0] })
    expect(check.status).toBe(NOT_FOUND)
    expect(await check.text()).not.toContain('correct')

    const finish = await request('POST', `/api/play/${created.shareToken}/finish`, { version: quiz.version, answers: [[1], [0, 2]] })
    expect(finish.status).toBe(200)
    expect(Object.keys(((await finish.json()) as { result: object }).result).sort()).toEqual(
      ['correctCount', 'grade', 'partialCount', 'percent', 'totalCount'],
    )
  })
})

describe('/api/play: ошибки', () => {
  it('удалённая и неизвестная викторина, невалидный токен — 404', async () => {
    const created = await createQuiz()
    await app.request(
      `/api/quizzes/${created.id}`,
      { method: 'DELETE', headers: { origin: TEST_WEB_ORIGIN, ...authHeader } },
      fromIp(),
    )
    expect((await request('GET', `/api/play/${created.shareToken}`)).status).toBe(NOT_FOUND)
    expect((await request('GET', `/api/play/${UNKNOWN_TOKEN}`)).status).toBe(NOT_FOUND)
    expect((await request('GET', '/api/play/short')).status).toBe(NOT_FOUND)
  })

  it('старый version — 409 на check и finish', async () => {
    const created = await createQuiz()
    const check = await request('POST', `/api/play/${created.shareToken}/check`, { version: 'old', questionIndex: 0, selected: [0] })
    const finish = await request('POST', `/api/play/${created.shareToken}/finish`, { version: 'old', answers: [[0], [0, 1]] })
    expect(check.status).toBe(CONFLICT)
    expect(finish.status).toBe(CONFLICT)
  })

  it('версия меняется после правки викторины', async () => {
    const created = await createQuiz()
    const before = await loadPlay(created.shareToken)
    await app.request(
      `/api/quizzes/${created.id}`,
      { method: 'PATCH', headers: { origin: TEST_WEB_ORIGIN, 'content-type': 'application/json', ...authHeader }, body: JSON.stringify({ ...INPUT, title: 'Новое' }) },
      fromIp(),
    )
    const check = await request('POST', `/api/play/${created.shareToken}/check`, { version: before.version, questionIndex: 0, selected: [0] })
    expect(check.status).toBe(CONFLICT)
  })

  it('лишние, повторные и выходящие за диапазон индексы — 400', async () => {
    const created = await createQuiz()
    const { version } = await loadPlay(created.shareToken)
    const path = `/api/play/${created.shareToken}`
    const bodies: Array<[string, unknown]> = [
      ['check', { version, questionIndex: 0, selected: [0, 1] }],
      ['check', { version, questionIndex: 0, selected: [5] }],
      ['check', { version, questionIndex: 0, selected: [0, 0] }],
      ['check', { version, questionIndex: 9, selected: [0] }],
      ['finish', { version, answers: [[0]] }],
      ['finish', { version, answers: [[0, 1], [0, 1]] }],
      ['finish', { version, answers: [[2], [0, 1]] }],
      ['finish', { version, answers: [[0], [0, 0]] }],
    ]
    for (const [route, body] of bodies) {
      expect((await request('POST', `${path}/${route}`, body)).status).toBe(BAD_REQUEST)
    }
  })

  it('121-й GET за минуту — 429', async () => {
    const created = await createQuiz()
    for (let i = 0; i < GET_LIMIT; i += 1) {
      expect((await request('GET', `/api/play/${created.shareToken}`, undefined, '10.0.0.7')).status).toBe(200)
    }
    const limited = await request('GET', `/api/play/${created.shareToken}`, undefined, '10.0.0.7')
    expect(limited.status).toBe(TOO_MANY_REQUESTS)
    expect(limited.headers.get('retry-after')).not.toBeNull()
    expect((await request('GET', `/api/play/${created.shareToken}`, undefined, '10.0.0.8')).status).toBe(200)
  })

  it('121-й POST /finish за минуту — 429', async () => {
    const created = await createQuiz()
    const { version } = await loadPlay(created.shareToken)
    const finish = (ip: string) =>
      request('POST', `/api/play/${created.shareToken}/finish`, { version, answers: [[1], [0, 2]] }, ip)
    for (let i = 0; i < FINISH_LIMIT; i += 1) {
      expect((await finish('10.0.0.9')).status).toBe(200)
    }
    expect((await finish('10.0.0.9')).status).toBe(TOO_MANY_REQUESTS)
  })
})

describe('/api/play: картинки', () => {
  const IMAGE_URL_PATTERN = new RegExp(`^${MEMORY_IMAGES_BASE_URL}/quiz-images/[0-9a-f-]{36}\\.webp$`)

  async function seedImage(storage: ReturnType<typeof makeMemoryImageStorage>, teacherId: string) {
    const id = randomUUID()
    await prisma.quizImage.create({ data: { id, teacherId } })
    await storage.storage.put(`quiz-images/${id}.webp`, new Uint8Array([1]), 'image/webp')
    return id
  }

  it('вопрос и варианты отдают адреса картинок одного вида у верных и неверных, без id и правильности', async () => {
    const storage = makeMemoryImageStorage()
    app = createTestApp({ prisma, imageStorage: storage.storage })
    const teacher = await createTeacher(prisma)
    authHeader = { authorization: `Bearer ${await tokens.signAccessToken(teacher.id)}` }
    const [questionImage, correctImage, wrongImage] = [
      await seedImage(storage, teacher.id),
      await seedImage(storage, teacher.id),
      await seedImage(storage, teacher.id),
    ]
    const created = await createQuiz({
      ...INPUT,
      questions: [
        {
          text: 'Где кошка?',
          imageId: questionImage!,
          options: [
            { text: 'Собака', isCorrect: false, imageId: wrongImage! },
            { text: '', isCorrect: true, imageId: correctImage! },
          ],
        },
      ],
    })

    const response = await request('GET', `/api/play/${created.shareToken}`)
    const text = await response.text()
    expect(response.status).toBe(200)
    for (const forbidden of ['imageId', 'isCorrect', 'correct', teacher.id]) expect(text).not.toContain(forbidden)

    const question = playQuizResponseSchema.parse(JSON.parse(text)).quiz.questions[0]!
    expect(question.imageUrl).toBe(`${MEMORY_IMAGES_BASE_URL}/quiz-images/${questionImage}.webp`)
    expect(question.options).toEqual([
      { text: 'Собака', imageUrl: `${MEMORY_IMAGES_BASE_URL}/quiz-images/${wrongImage}.webp` },
      { text: '', imageUrl: `${MEMORY_IMAGES_BASE_URL}/quiz-images/${correctImage}.webp` },
    ])
    for (const option of question.options) expect(option.imageUrl).toMatch(IMAGE_URL_PATTERN)
  })

  it('викторина шага 1 без полей картинок в БД открывается и проходится', async () => {
    const teacher = await createTeacher(prisma)
    const stepOneQuestions = [
      { text: 'Столица Франции?', options: [{ text: 'Рим', isCorrect: false }, { text: 'Париж', isCorrect: true }] },
    ]
    const shareToken = 'S'.repeat(22)
    await prisma.quiz.create({ data: { teacherId: teacher.id, title: 'Шаг 1', shareToken, gradingScale: 'five', questions: stepOneQuestions } })

    const quiz = await loadPlay(shareToken)
    expect(quiz.questions[0]).toEqual({
      text: 'Столица Франции?',
      imageUrl: null,
      options: [
        { text: 'Рим', imageUrl: null },
        { text: 'Париж', imageUrl: null },
      ],
      selectCount: 1,
    })
    const finish = await request('POST', `/api/play/${shareToken}/finish`, { version: quiz.version, answers: [[1]] })
    expect(finish.status).toBe(200)
    expect(playFinishResponseSchema.parse(await finish.json()).result.percent).toBe(100)
  })
})
