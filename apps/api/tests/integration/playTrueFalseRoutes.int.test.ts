import { randomBytes } from 'node:crypto'
import { apiErrorResponseSchema, playActivityResponseSchema, playTrueFalseCheckResponseSchema, playTrueFalseFinishResponseSchema, playTrueFalseResponseSchema } from '@nataskium/shared/schemas'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PLAY_LIMITS } from '../../src/features/play'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const SHARE_TOKEN_BYTES = 16
const ITEMS = [
  { statement: 'Земля круглая', answer: true },
  { statement: 'Солнце холодное', answer: false },
  { statement: 'Вода мокрая', answer: true },
]
const RIGHT = ITEMS.map((item) => item.answer)

let prisma: PrismaClient

const newToken = () => randomBytes(SHARE_TOKEN_BYTES).toString('base64url')

async function seedTrueFalse(options: { deletedAt?: Date | null; showAnswers?: boolean; gradingScale?: string | null } = {}) {
  const teacher = await createTeacher(prisma)
  return prisma.quiz.create({
    data: {
      teacherId: teacher.id,
      type: 'truefalse',
      title: 'Факты',
      shareToken: newToken(),
      showAnswers: options.showAnswers ?? false,
      gradingScale: options.gradingScale === undefined ? 'five' : options.gradingScale,
      timerMode: 'limit',
      timeLimitSeconds: 600,
      questions: ITEMS,
      deletedAt: options.deletedAt ?? null,
    },
  })
}

async function seedQuiz() {
  const teacher = await createTeacher(prisma)
  return prisma.quiz.create({
    data: {
      teacherId: teacher.id,
      title: 'Викторина',
      shareToken: newToken(),
      showAnswers: true,
      questions: [{ text: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] }],
    },
  })
}

async function seedMatching() {
  const teacher = await createTeacher(prisma)
  return prisma.quiz.create({
    data: {
      teacherId: teacher.id,
      type: 'matching',
      title: 'Животные',
      shareToken: newToken(),
      questions: [{ term: 'кот', definition: 'мяукает' }, { term: 'пёс', definition: 'лает' }],
    },
  })
}

// Новое приложение на каждый запрос: счётчики лимитов по IP не копятся между вызовами
async function request(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { origin: TEST_WEB_ORIGIN }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const init = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }
  return createTestApp({ prisma }).request(path, init, fromIp())
}

async function versionOf(shareToken: string): Promise<string> {
  return playTrueFalseResponseSchema.parse(await (await request('GET', `/api/play/${shareToken}`)).json()).trueFalse.version
}

const finish = (shareToken: string, body: unknown) => request('POST', `/api/play/${shareToken}/true-false/finish`, body)
const check = (shareToken: string, body: unknown) => request('POST', `/api/play/${shareToken}/true-false/check`, body)

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

describe('GET /api/play/:token — да/нет', () => {
  it('проходит playActivityResponseSchema и playTrueFalseResponseSchema, утверждения по порядку', async () => {
    const row = await seedTrueFalse()

    const response = await request('GET', `/api/play/${row.shareToken}`)

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(playActivityResponseSchema.parse(json).type).toBe('truefalse')
    expect(playTrueFalseResponseSchema.parse(json).trueFalse).toMatchObject({
      title: 'Факты',
      showAnswers: false,
      timer: { mode: 'limit', seconds: 600 },
      statements: ITEMS.map((item) => item.statement),
    })
  })

  it('no-leak: в теле нет ответов, id, токена, шкалы и данных автора', async () => {
    const row = await seedTrueFalse({ showAnswers: true })

    const text = await (await request('GET', `/api/play/${row.shareToken}`)).text()

    for (const leak of ['answer', 'items', 'correct', 'gradingScale', row.id, row.teacherId, row.shareToken]) expect(text).not.toContain(leak)
    expect(Object.keys(JSON.parse(text).trueFalse).sort()).toEqual(['showAnswers', 'statements', 'timer', 'title', 'version'])
  })

  it('удалённое задание — 404', async () => {
    const row = await seedTrueFalse({ deletedAt: new Date() })

    expect((await request('GET', `/api/play/${row.shareToken}`)).status).toBe(404)
  })
})

describe('POST /api/play/:token/true-false/finish', () => {
  it('все верно — 100 % и оценка; review нет при showAnswers = false', async () => {
    const row = await seedTrueFalse()

    const response = await finish(row.shareToken, { version: await versionOf(row.shareToken), answers: RIGHT })

    expect(response.status).toBe(200)
    expect(playTrueFalseFinishResponseSchema.parse(await response.json())).toEqual({
      result: { percent: 100, grade: '5', correctCount: 3, partialCount: 0, totalCount: 3 },
    })
  })

  it('showAnswers = true: review с правильным ответом для каждого утверждения', async () => {
    const row = await seedTrueFalse({ showAnswers: true })
    const answers = [true, true, null]

    const body = playTrueFalseFinishResponseSchema.parse(await (await finish(row.shareToken, { version: await versionOf(row.shareToken), answers })).json())

    expect(body.result).toMatchObject({ correctCount: 1, totalCount: 3 })
    expect(body.review).toEqual([
      { correct: true, answer: true },
      { correct: false, answer: false },
      { correct: false, answer: true },
    ])
  })

  it('устаревшая версия — 409; неверная длина и не-boolean — 400', async () => {
    const row = await seedTrueFalse()
    const version = await versionOf(row.shareToken)

    expect((await finish(row.shareToken, { version: '2000-01-01T00:00:00.000Z', answers: RIGHT })).status).toBe(409)
    expect((await finish(row.shareToken, { version, answers: [true, false] })).status).toBe(400)
    expect((await finish(row.shareToken, { version, answers: [true, false, true, null] })).status).toBe(400)
    expect((await finish(row.shareToken, { version, answers: ['true', false, true] })).status).toBe(400)
  })

  it('удалённое задание — 404', async () => {
    const row = await seedTrueFalse()
    const version = await versionOf(row.shareToken)
    await prisma.quiz.update({ where: { id: row.id }, data: { deletedAt: new Date() } })

    expect((await finish(row.shareToken, { version, answers: RIGHT })).status).toBe(404)
  })

  it('типы не пересекаются: токен сопоставления на /true-false/*, токен «да/нет» на /matching/finish — 404', async () => {
    const matching = await seedMatching()
    const row = await seedTrueFalse({ showAnswers: true })

    expect((await finish(matching.shareToken, { version: 'v1', answers: [true, false] })).status).toBe(404)
    expect((await check(matching.shareToken, { version: 'v1', index: 0, answer: true })).status).toBe(404)
    expect((await request('POST', `/api/play/${row.shareToken}/matching/finish`, { version: 'v1', answers: [null, null, null] })).status).toBe(404)
  })

  it('запрос finish сверх лимита с одного IP — 429', async () => {
    const app = createTestApp({ prisma })
    const row = await seedTrueFalse()
    const ip = '10.0.0.43'
    const send = (path: string, body: unknown) => {
      const headers: Record<string, string> = { origin: TEST_WEB_ORIGIN, 'content-type': 'application/json' }
      return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) }, fromIp(ip))
    }
    const version = await versionOf(row.shareToken)
    for (let i = 0; i < PLAY_LIMITS.finish.max; i += 1) {
      expect((await send(`/api/play/${newToken()}/true-false/finish`, { version: 'v1', answers: [true] })).status).toBe(404)
    }

    expect((await send(`/api/play/${row.shareToken}/true-false/finish`, { version, answers: RIGHT })).status).toBe(429)
  })
})

describe('изоляция типов викторины и «да/нет»', () => {
  async function expectNotFound(response: Response) {
    expect(response.status).toBe(404)
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('Quiz not found')
  }

  it('токен викторины на /true-false/check и /true-false/finish — 404', async () => {
    const quiz = await seedQuiz()

    await expectNotFound(await check(quiz.shareToken, { version: 'v1', index: 0, answer: true }))
    await expectNotFound(await finish(quiz.shareToken, { version: 'v1', answers: [true] }))
  })

  it('токен «да/нет» на /check и /finish викторины — 404', async () => {
    const row = await seedTrueFalse({ showAnswers: true })

    await expectNotFound(await request('POST', `/api/play/${row.shareToken}/check`, { version: 'v1', questionIndex: 0, selected: [0] }))
    await expectNotFound(await request('POST', `/api/play/${row.shareToken}/finish`, { version: 'v1', answers: [[0]] }))
  })
})

describe('POST /api/play/:token/true-false/check', () => {
  it('showAnswers = true: correct по ответу, индекс вне диапазона — 400', async () => {
    const row = await seedTrueFalse({ showAnswers: true })
    const version = await versionOf(row.shareToken)

    const right = await check(row.shareToken, { version, index: 1, answer: false })
    expect(playTrueFalseCheckResponseSchema.parse(await right.json())).toEqual({ correct: true })
    const wrong = await check(row.shareToken, { version, index: 1, answer: true })
    expect(playTrueFalseCheckResponseSchema.parse(await wrong.json())).toEqual({ correct: false })
    expect((await check(row.shareToken, { version, index: 3, answer: true })).status).toBe(400)
    expect((await check(row.shareToken, { version, index: -1, answer: true })).status).toBe(400)
  })

  it('showAnswers = false — 404', async () => {
    const row = await seedTrueFalse({ showAnswers: false })

    expect((await check(row.shareToken, { version: await versionOf(row.shareToken), index: 0, answer: true })).status).toBe(404)
  })

  it('запрос check сверх лимита с одного IP — 429', async () => {
    const app = createTestApp({ prisma })
    const row = await seedTrueFalse({ showAnswers: true })
    const ip = '10.0.0.44'
    const send = (path: string, body: unknown) => {
      const headers: Record<string, string> = { origin: TEST_WEB_ORIGIN, 'content-type': 'application/json' }
      return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) }, fromIp(ip))
    }
    const version = await versionOf(row.shareToken)
    for (let i = 0; i < PLAY_LIMITS.check.max; i += 1) {
      expect((await send(`/api/play/${newToken()}/true-false/check`, { version: 'v1', index: 0, answer: true })).status).toBe(404)
    }

    expect((await send(`/api/play/${row.shareToken}/true-false/check`, { version, index: 0, answer: true })).status).toBe(429)
  })
})
