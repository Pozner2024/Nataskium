import { randomBytes } from 'node:crypto'
import {
  apiErrorResponseSchema,
  libraryTakeResponseSchema,
  playActivityResponseSchema,
  playCheckResponseSchema,
  playFinishResponseSchema,
  playMatchingFinishResponseSchema,
  playTrueFalseCheckResponseSchema,
  playTrueFalseFinishResponseSchema,
} from '@nataskium/shared/schemas'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTokenService } from '../../src/features/auth'
import { PLAY_LIMITS } from '../../src/features/play'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

// Игра из библиотеки по публичному номеру (ADR-0019): поведение /api/play, публичность — только у резолвера
const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })
const SHARE_TOKEN_BYTES = 16
const NOT_FOUND = 404
const CONFLICT = 409
const TOO_MANY_REQUESTS = 429
const MISSING_NUMBER_OFFSET = 1000
const STALE_VERSION = '2000-01-01T00:00:00.000Z'

const QUESTIONS = [
  { text: 'Столица Франции?', imageId: null, options: [{ text: 'Рим', isCorrect: false, imageId: null }, { text: 'Париж', isCorrect: true, imageId: null }] },
  { text: 'Простые числа?', imageId: null, options: [{ text: '2', isCorrect: true, imageId: null }, { text: '4', isCorrect: false, imageId: null }, { text: '5', isCorrect: true, imageId: null }] },
]
const PAIRS = [
  { term: 'кот', definition: 'мяукает' },
  { term: 'пёс', definition: 'лает' },
  { term: 'корова', definition: 'мычит' },
]
const ITEMS = [
  { statement: 'Земля круглая', answer: true },
  { statement: 'Солнце холодное', answer: false },
]

type Kind = 'quiz' | 'matching' | 'truefalse'
type Seed = { kind?: Kind; isPublic?: boolean; moderationHiddenAt?: Date; deletedAt?: Date }

const CONTENT: Record<Kind, unknown> = { quiz: QUESTIONS, matching: PAIRS, truefalse: ITEMS }

let prisma: PrismaClient

const newToken = () => randomBytes(SHARE_TOKEN_BYTES).toString('base64url')

async function seed({ kind = 'quiz', ...flags }: Seed = {}) {
  const teacher = await createTeacher(prisma)
  return prisma.quiz.create({
    data: {
      teacherId: teacher.id,
      type: kind,
      title: `Задание ${kind}`,
      shareToken: newToken(),
      showAnswers: true,
      gradingScale: 'five',
      questions: CONTENT[kind] as object[],
      ...flags,
    },
  })
}

type App = ReturnType<typeof createTestApp>

function send(app: App, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { origin: TEST_WEB_ORIGIN }
  if (body !== undefined) headers['content-type'] = 'application/json'
  return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, fromIp())
}

// Новое приложение на каждый запрос: счётчики лимитов не копятся между вызовами
const request = (method: string, path: string, body?: unknown) => send(createTestApp({ prisma }), method, path, body)

async function versionOf(path: string): Promise<string> {
  const activity = playActivityResponseSchema.parse(await (await request('GET', path)).json())
  if (activity.type === 'quiz') return activity.quiz.version
  if (activity.type === 'matching') return activity.matching.version
  return activity.trueFalse.version
}

// Все шесть маршрутов игры с валидными телами; тело без version не пройдёт схему раньше номера
function allRoutes(version: string) {
  return [
    { method: 'GET', suffix: '', body: undefined },
    { method: 'POST', suffix: '/check', body: { version, questionIndex: 0, selected: [1] } },
    { method: 'POST', suffix: '/finish', body: { version, answers: [[1], [0, 2]] } },
    { method: 'POST', suffix: '/matching/finish', body: { version, answers: PAIRS.map((pair) => pair.term) } },
    { method: 'POST', suffix: '/true-false/check', body: { version, index: 0, answer: true } },
    { method: 'POST', suffix: '/true-false/finish', body: { version, answers: ITEMS.map((item) => item.answer) } },
  ]
}

// Маршруты своего типа: на чужом типе use-case игры и так отвечает 404
const ROUTES_OF: Record<Kind, string[]> = {
  quiz: ['', '/check', '/finish'],
  matching: ['', '/matching/finish'],
  truefalse: ['', '/true-false/check', '/true-false/finish'],
}

function routesOf(kind: Kind, version: string) {
  return allRoutes(version).filter((route) => ROUTES_OF[kind].includes(route.suffix))
}

function headersText(response: Response): string {
  return [...response.headers.entries()].map(([name, value]) => `${name}: ${value}`).join('\n')
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

describe('/api/library/play: тот же результат, что у /api/play', () => {
  it('викторина: GET, check и finish по номеру совпадают с ответами по shareToken', async () => {
    const row = await seed({ kind: 'quiz' })
    const byNumber = `/api/library/play/${row.publicNumber}`
    const byToken = `/api/play/${row.shareToken}`

    const libraryText = await (await request('GET', byNumber)).text()
    expect(playActivityResponseSchema.parse(JSON.parse(libraryText))).toEqual(playActivityResponseSchema.parse(await (await request('GET', byToken)).json()))
    expect(libraryText).not.toContain('isCorrect')

    const version = await versionOf(byNumber)
    const check = { version, questionIndex: 1, selected: [0, 1] }
    const checked = playCheckResponseSchema.parse(await (await request('POST', `${byNumber}/check`, check)).json())
    expect(checked).toEqual(playCheckResponseSchema.parse(await (await request('POST', `${byToken}/check`, check)).json()))
    expect(checked.correct).toEqual([0, 2])

    const finish = { version, answers: [[1], [0, 1]] }
    const finished = playFinishResponseSchema.parse(await (await request('POST', `${byNumber}/finish`, finish)).json())
    expect(finished).toEqual(playFinishResponseSchema.parse(await (await request('POST', `${byToken}/finish`, finish)).json()))
    expect(finished.result).toMatchObject({ percent: 75, grade: '4' })
  })

  it('сопоставление: GET (без связи пар) и matching/finish по номеру совпадают с ответами по shareToken', async () => {
    const row = await seed({ kind: 'matching' })
    const byNumber = `/api/library/play/${row.publicNumber}`
    const byToken = `/api/play/${row.shareToken}`

    const fromLibrary = playActivityResponseSchema.parse(await (await request('GET', byNumber)).json())
    const fromPlay = playActivityResponseSchema.parse(await (await request('GET', byToken)).json())
    if (fromLibrary.type !== 'matching' || fromPlay.type !== 'matching') throw new Error('expected matching')
    expect(Object.keys(fromLibrary.matching).sort()).toEqual(Object.keys(fromPlay.matching).sort())
    expect(fromLibrary.matching.definitions).toEqual(fromPlay.matching.definitions)
    expect([...fromLibrary.matching.terms].sort()).toEqual([...fromPlay.matching.terms].sort())

    const finish = { version: fromLibrary.matching.version, answers: [PAIRS[0].term, PAIRS[2].term, PAIRS[1].term] }
    const finished = playMatchingFinishResponseSchema.parse(await (await request('POST', `${byNumber}/matching/finish`, finish)).json())
    expect(finished).toEqual(playMatchingFinishResponseSchema.parse(await (await request('POST', `${byToken}/matching/finish`, finish)).json()))
    expect(finished.result.correctCount).toBe(1)
  })

  it('да/нет: GET (без ответов), true-false/check и true-false/finish по номеру совпадают с ответами по shareToken', async () => {
    const row = await seed({ kind: 'truefalse' })
    const byNumber = `/api/library/play/${row.publicNumber}`
    const byToken = `/api/play/${row.shareToken}`

    const libraryText = await (await request('GET', byNumber)).text()
    expect(playActivityResponseSchema.parse(JSON.parse(libraryText))).toEqual(playActivityResponseSchema.parse(await (await request('GET', byToken)).json()))
    expect(libraryText).not.toContain('"answer"')

    const version = await versionOf(byNumber)
    const check = { version, index: 1, answer: true }
    const checked = playTrueFalseCheckResponseSchema.parse(await (await request('POST', `${byNumber}/true-false/check`, check)).json())
    expect(checked).toEqual(playTrueFalseCheckResponseSchema.parse(await (await request('POST', `${byToken}/true-false/check`, check)).json()))
    expect(checked.correct).toBe(false)

    const finish = { version, answers: [true, null] }
    const finished = playTrueFalseFinishResponseSchema.parse(await (await request('POST', `${byNumber}/true-false/finish`, finish)).json())
    expect(finished).toEqual(playTrueFalseFinishResponseSchema.parse(await (await request('POST', `${byToken}/true-false/finish`, finish)).json()))
    expect(finished.result.correctCount).toBe(1)
  })

  it('устаревшая version по номеру — 409, как у /api/play', async () => {
    const quiz = await seed({ kind: 'quiz' })
    const matching = await seed({ kind: 'matching' })
    const trueFalse = await seed({ kind: 'truefalse' })

    for (const [row, kind] of [[quiz, 'quiz'], [matching, 'matching'], [trueFalse, 'truefalse']] as const) {
      for (const route of routesOf(kind, STALE_VERSION).filter((item) => item.method === 'POST')) {
        const response = await request('POST', `/api/library/play/${row.publicNumber}${route.suffix}`, route.body)
        expect(response.status).toBe(CONFLICT)
      }
    }
  })
})

describe('/api/library/play: только опубликованные задания', () => {
  it('снято с публикации, скрыто модерацией, удалено и несуществующий номер — 404 «Quiz not found» на всех шести маршрутах', async () => {
    const rows = [
      await seed({ kind: 'quiz', isPublic: false }),
      await seed({ kind: 'matching', moderationHiddenAt: new Date() }),
      await seed({ kind: 'truefalse', deletedAt: new Date() }),
      await seed({ kind: 'quiz', moderationHiddenAt: new Date() }),
    ]
    const numbers = [...rows.map((row) => row.publicNumber), Math.max(...rows.map((row) => row.publicNumber)) + MISSING_NUMBER_OFFSET]

    for (const number of numbers) {
      for (const route of allRoutes('v1')) {
        const response = await request(route.method, `/api/library/play/${number}${route.suffix}`, route.body)
        expect(response.status).toBe(NOT_FOUND)
        expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('Quiz not found')
      }
    }
  })

  it('копия «Взять себе» по своему номеру не играется: она непубличная', async () => {
    const source = await seed({ kind: 'quiz' })
    const taker = await createTeacher(prisma)
    const taken = await createTestApp({ prisma }).request(
      `/api/library/${source.publicNumber}/take`,
      { method: 'POST', headers: { origin: TEST_WEB_ORIGIN, authorization: `Bearer ${await tokens.signAccessToken(taker.id)}` } },
      fromIp(),
    )
    expect(taken.status).toBe(201)
    const { quizId } = libraryTakeResponseSchema.parse(await taken.json())
    const copy = await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })

    const version = await versionOf(`/api/play/${copy.shareToken}`)
    for (const route of routesOf('quiz', version)) {
      expect((await request(route.method, `/api/library/play/${copy.publicNumber}${route.suffix}`, route.body)).status).toBe(NOT_FOUND)
    }
  })

  it('карточки задания больше нет: GET /api/library/<номер> — 404', async () => {
    const row = await seed({ kind: 'quiz' })

    expect((await request('GET', `/api/library/${row.publicNumber}`)).status).toBe(NOT_FOUND)
  })
})

describe('/api/library/play: shareToken и правильные ответы не уходят клиенту', () => {
  it('ни тело, ни заголовки ответов (200, 404 и 409) не содержат shareToken задания', async () => {
    const rows = [await seed({ kind: 'quiz' }), await seed({ kind: 'matching' }), await seed({ kind: 'truefalse' })]

    for (const row of rows) {
      const path = `/api/library/play/${row.publicNumber}`
      const version = await versionOf(path)
      for (const route of [...allRoutes(version), ...allRoutes(STALE_VERSION)]) {
        const response = await request(route.method, `${path}${route.suffix}`, route.body)
        expect(await response.text()).not.toContain(row.shareToken)
        expect(headersText(response)).not.toContain(row.shareToken)
      }
    }
  })

  it('GET викторины: без isCorrect, тот же набор ключей, что у /api/play', async () => {
    const row = await seed({ kind: 'quiz' })

    const text = await (await request('GET', `/api/library/play/${row.publicNumber}`)).text()
    const activity = playActivityResponseSchema.parse(JSON.parse(text))
    const reference = playActivityResponseSchema.parse(await (await request('GET', `/api/play/${row.shareToken}`)).json())

    if (activity.type !== 'quiz' || reference.type !== 'quiz') throw new Error('expected quiz')
    for (const leak of ['isCorrect', 'correct', 'shareToken', 'gradingScale', row.id, row.teacherId]) expect(text).not.toContain(leak)
    expect(Object.keys(activity.quiz).sort()).toEqual(Object.keys(reference.quiz).sort())
    expect(Object.keys(activity.quiz.questions[0] ?? {}).sort()).toEqual(['imageUrl', 'options', 'selectCount', 'text'])
  })
})

describe('/api/library/play: через createApp', () => {
  it('тело 404 невалидного адреса побайтно равно телу /api/play', async () => {
    const app = createTestApp({ prisma })

    const play = await send(app, 'GET', '/api/play/abc')
    const library = await send(app, 'GET', '/api/library/play/abc')
    const missing = await send(app, 'GET', '/api/library/play/2147483647')

    expect([play.status, library.status, missing.status]).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND])
    const body = await play.text()
    expect(await library.text()).toBe(body)
    expect(await missing.text()).toBe(body)
  })

  it(`лимит GET общий с /api/play: после ${PLAY_LIMITS.get.max} запросов по ссылке игра из библиотеки — 429`, async () => {
    const row = await seed({ kind: 'quiz' })
    const app = createTestApp({ prisma })

    for (let i = 0; i < PLAY_LIMITS.get.max; i++) expect((await send(app, 'GET', `/api/play/${row.shareToken}`)).status).toBe(200)

    expect((await send(app, 'GET', `/api/library/play/${row.publicNumber}`)).status).toBe(TOO_MANY_REQUESTS)
  })

  it(`лимит GET общий в обратную сторону: после ${PLAY_LIMITS.get.max} запросов из библиотеки /api/play — 429`, async () => {
    const row = await seed({ kind: 'quiz' })
    const app = createTestApp({ prisma })

    for (let i = 0; i < PLAY_LIMITS.get.max; i++) expect((await send(app, 'GET', `/api/library/play/${row.publicNumber}`)).status).toBe(200)

    expect((await send(app, 'GET', `/api/play/${row.shareToken}`)).status).toBe(TOO_MANY_REQUESTS)
  })
})
