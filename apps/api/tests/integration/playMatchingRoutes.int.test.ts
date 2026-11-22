import { randomBytes } from 'node:crypto'
import {
  playActivityResponseSchema,
  playMatchingFinishResponseSchema,
  playMatchingResponseSchema,
  playQuizResponseSchema,
} from '@nataskium/shared/schemas'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeMatchingRepository } from '../../src/features/matchings'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const SHARE_TOKEN_BYTES = 16
const FINISH_PER_MINUTE = 120
const PAIRS = [
  { term: 'кот', definition: 'мяукает' },
  { term: 'пёс', definition: 'лает' },
  { term: 'корова', definition: 'мычит' },
  { term: 'утка', definition: 'крякает' },
]

let prisma: PrismaClient

async function seedMatching(
  options: { deletedAt?: Date | null; showAnswers?: boolean; gradingScale?: string | null; pairs?: { term: string; definition: string }[] } = {},
) {
  const teacher = await createTeacher(prisma)
  return prisma.quiz.create({
    data: {
      teacherId: teacher.id,
      type: 'matching',
      title: 'Животные',
      shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
      showAnswers: options.showAnswers ?? false,
      gradingScale: options.gradingScale === undefined ? 'five' : options.gradingScale,
      timerMode: 'limit',
      timeLimitSeconds: 600,
      introTheme: 'nataskium-day',
      questions: options.pairs ?? PAIRS,
      deletedAt: options.deletedAt ?? null,
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

describe('GET /api/play/:token — сопоставление', () => {
  it('type matching: определения по порядку, слова — мультимножество слов, version = updatedAt из findOwned', async () => {
    const row = await seedMatching()

    const response = await request('GET', `/api/play/${row.shareToken}`)

    expect(response.status).toBe(200)
    const { matching } = playMatchingResponseSchema.parse(await response.json())
    const stored = await makeMatchingRepository(prisma).findOwned(row.id, row.teacherId)
    expect(matching).toMatchObject({
      title: 'Животные',
      showAnswers: false,
      timer: { mode: 'limit', seconds: 600 },
      version: stored?.updatedAt.toISOString(),
      definitions: PAIRS.map((pair) => pair.definition),
    })
    expect([...matching.terms].sort()).toEqual(PAIRS.map((pair) => pair.term).sort())
  })

  it('no-leak: в теле нет пар, id, токена, шкалы и данных автора', async () => {
    const row = await seedMatching()

    const text = await (await request('GET', `/api/play/${row.shareToken}`)).text()

    for (const leak of ['pairs', 'term"', 'definition"', 'correct', 'gradingScale', row.id, row.teacherId, row.shareToken]) {
      expect(text).not.toContain(leak)
    }
    expect(Object.keys(JSON.parse(text).matching).sort()).toEqual(['definitions', 'introTheme', 'showAnswers', 'terms', 'timer', 'title', 'version'])
  })

  it('слова перемешиваются заново: за серию запросов встречаются разные порядки', async () => {
    const row = await seedMatching()
    const orders = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const { matching } = playMatchingResponseSchema.parse(await (await request('GET', `/api/play/${row.shareToken}`)).json())
      orders.add(matching.terms.join('|'))
    }

    expect(orders.size).toBeGreaterThan(1)
  })

  it('удалённое сопоставление — 404', async () => {
    const row = await seedMatching({ deletedAt: new Date() })

    expect((await request('GET', `/api/play/${row.shareToken}`)).status).toBe(404)
  })

  it('токен викторины — по-прежнему type quiz', async () => {
    const teacher = await createTeacher(prisma)
    const quiz = await prisma.quiz.create({
      data: {
        teacherId: teacher.id,
        title: 'Столицы',
        shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
        questions: [{ text: 'Q', imageId: null, options: [{ text: 'a', isCorrect: true, imageId: null }, { text: 'b', isCorrect: false, imageId: null }] }],
      },
    })

    const body = playActivityResponseSchema.parse(await (await request('GET', `/api/play/${quiz.shareToken}`)).json())
    expect(body.type).toBe('quiz')
    expect(playQuizResponseSchema.safeParse(body).success).toBe(true)
  })
})

describe('POST /api/play/:token/matching/finish', () => {
  const RIGHT = PAIRS.map((pair) => pair.term)

  async function versionOf(shareToken: string): Promise<string> {
    return playMatchingResponseSchema.parse(await (await request('GET', `/api/play/${shareToken}`)).json()).matching.version
  }

  function finish(shareToken: string, body: unknown) {
    return request('POST', `/api/play/${shareToken}/matching/finish`, body)
  }

  it('все верно — 100 % и оценка; review нет при showAnswers = false', async () => {
    const row = await seedMatching()

    const response = await finish(row.shareToken, { version: await versionOf(row.shareToken), answers: RIGHT })

    expect(response.status).toBe(200)
    const body = playMatchingFinishResponseSchema.parse(await response.json())
    expect(body).toEqual({ result: { percent: 100, grade: '5', correctCount: 4, partialCount: 0, totalCount: 4 } })
  })

  it('showAnswers = true: review с правильным словом для каждого определения', async () => {
    const row = await seedMatching({ showAnswers: true })
    const answers = ['пёс', 'кот', null, 'утка']

    const body = playMatchingFinishResponseSchema.parse(await (await finish(row.shareToken, { version: await versionOf(row.shareToken), answers })).json())

    expect(body.result).toMatchObject({ percent: 25, correctCount: 1, partialCount: 0, totalCount: 4 })
    expect(body.review).toEqual(PAIRS.map((pair, index) => ({ correct: index === 3, term: pair.term })))
  })

  it('null на всех позициях — 200 и 0 %', async () => {
    const row = await seedMatching({ gradingScale: null })

    const response = await finish(row.shareToken, { version: await versionOf(row.shareToken), answers: PAIRS.map(() => null) })

    expect(response.status).toBe(200)
    expect(playMatchingFinishResponseSchema.parse(await response.json()).result).toEqual({ percent: 0, grade: null, correctCount: 0, partialCount: 0, totalCount: 4 })
  })

  it('устаревшая версия — 409', async () => {
    const row = await seedMatching()

    expect((await finish(row.shareToken, { version: '2000-01-01T00:00:00.000Z', answers: RIGHT })).status).toBe(409)
  })

  it('400: длина ±1, чужое слово, пробелы, повтор; введённое слово в ответ не попадает', async () => {
    const row = await seedMatching()
    const other = await seedMatching()
    await prisma.quiz.update({ where: { id: other.id }, data: { questions: [{ term: 'секретное', definition: 'a' }, { term: 'b', definition: 'c' }] } })
    const version = await versionOf(row.shareToken)

    for (const answers of [
      RIGHT.slice(0, 3),
      [...RIGHT, null],
      ['кот', 'пёс', 'корова', 'секретное'],
      ['кот', 'пёс', 'корова', '   '],
      ['кот', 'пёс', 'корова', ' утка '],
      ['кот', 'кот', 'корова', 'утка'],
    ]) {
      const response = await finish(row.shareToken, { version, answers })
      expect(response.status, JSON.stringify(answers)).toBe(400)
      expect(await response.text()).not.toContain('секретное')
    }
  })

  it('типы не пересекаются: токен викторины на /matching/finish и токен сопоставления на /finish и /check — 404', async () => {
    const row = await seedMatching()
    const teacher = await createTeacher(prisma)
    const quiz = await prisma.quiz.create({
      data: {
        teacherId: teacher.id,
        title: 'Столицы',
        shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
        questions: [{ text: 'Q', imageId: null, options: [{ text: 'a', isCorrect: true, imageId: null }, { text: 'b', isCorrect: false, imageId: null }] }],
      },
    })

    expect((await finish(quiz.shareToken, { version: 'v1', answers: [null] })).status).toBe(404)
    expect((await request('POST', `/api/play/${row.shareToken}/finish`, { version: 'v1', answers: [[0]] })).status).toBe(404)
    expect((await request('POST', `/api/play/${row.shareToken}/check`, { version: 'v1', questionIndex: 0, selected: [0] })).status).toBe(404)
  })

  it('удалённое сопоставление — 404', async () => {
    const row = await seedMatching()
    const version = await versionOf(row.shareToken)
    await prisma.quiz.update({ where: { id: row.id }, data: { deletedAt: new Date() } })

    expect((await finish(row.shareToken, { version, answers: RIGHT })).status).toBe(404)
  })

  it.each([
    ['answers — строка', { version: 'v1', answers: 'кот' }],
    ['answers отсутствует', { version: 'v1' }],
    ['version отсутствует', { answers: RIGHT }],
    ['тело — массив', [RIGHT]],
  ])('400: %s', async (_name, body) => {
    const row = await seedMatching()

    expect((await finish(row.shareToken, body)).status).toBe(400)
  })

  it('10 пар, все верно — 100 %, оценка по шкале ten', async () => {
    const pairs = Array.from({ length: 10 }, (_, i) => ({ term: `слово ${i}`, definition: `определение ${i}` }))
    const row = await seedMatching({ pairs, gradingScale: 'ten' })

    const response = await finish(row.shareToken, { version: await versionOf(row.shareToken), answers: pairs.map((pair) => pair.term) })

    expect(playMatchingFinishResponseSchema.parse(await response.json()).result).toEqual({
      percent: 100,
      grade: '10',
      correctCount: 10,
      partialCount: 0,
      totalCount: 10,
    })
  })

  it.each([
    ['ten', '8'],
    ['five', '4'],
    ['letter', 'C'],
    [null, null],
  ])('3 из 4 верно (75 %): шкала %s → оценка %s', async (gradingScale, grade) => {
    const row = await seedMatching({ gradingScale })
    const answers = [PAIRS[0]!.term, PAIRS[1]!.term, PAIRS[2]!.term, null]

    const body = playMatchingFinishResponseSchema.parse(await (await finish(row.shareToken, { version: await versionOf(row.shareToken), answers })).json())

    expect(body.result).toEqual({ percent: 75, grade, correctCount: 3, partialCount: 0, totalCount: 4 })
  })

  it('неизвестный токен и токен викторины на /matching/finish — одинаковый ответ', async () => {
    const teacher = await createTeacher(prisma)
    const quiz = await prisma.quiz.create({
      data: {
        teacherId: teacher.id,
        title: 'Столицы',
        shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
        questions: [{ text: 'Q', imageId: null, options: [{ text: 'a', isCorrect: true, imageId: null }, { text: 'b', isCorrect: false, imageId: null }] }],
      },
    })
    const body = { version: 'v1', answers: [null] }

    const unknown = await finish(randomBytes(SHARE_TOKEN_BYTES).toString('base64url'), body)
    const asQuiz = await finish(quiz.shareToken, body)

    expect(unknown.status).toBe(404)
    expect(asQuiz.status).toBe(404)
    expect(await asQuiz.text()).toBe(await unknown.text())
  })

  it('121-й запрос finish с одного IP — 429; бюджет общий для finish викторины и сопоставления', async () => {
    const app = createTestApp({ prisma })
    const row = await seedMatching()
    const ip = '10.0.0.42'
    const send = (path: string, body: unknown) => {
      const headers: Record<string, string> = { origin: TEST_WEB_ORIGIN, 'content-type': 'application/json' }
      return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) }, fromIp(ip))
    }
    const version = await versionOf(row.shareToken)
    for (let i = 0; i < FINISH_PER_MINUTE; i += 1) {
      const unknownPath = `/api/play/${randomBytes(SHARE_TOKEN_BYTES).toString('base64url')}/finish`
      expect((await send(unknownPath, { version: 'v1', answers: [[0]] })).status).toBe(404)
    }

    expect((await send(`/api/play/${row.shareToken}/matching/finish`, { version, answers: RIGHT })).status).toBe(429)
  })

  it('строка, не прошедшая схему, — общий 500 без текста исключения', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const row = await seedMatching()
    await prisma.quiz.update({ where: { id: row.id }, data: { questions: [{ term: 'кот', definition: 'a' }, { term: 'кот', definition: 'b' }] } })

    const response = await finish(row.shareToken, { version: 'v1', answers: ['кот', null] })

    expect(response.status).toBe(500)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ error: 'Internal Server Error' })
    expect(text).not.toContain(row.id)
  })
})
