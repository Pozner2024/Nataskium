import { randomBytes, randomUUID } from 'node:crypto'
import {
  MAX_ACTIVITIES_PER_TEACHER,
  type MatchingInput,
  apiErrorResponseSchema,
  matchingResponseSchema,
  quizListResponseSchema,
} from '@nataskium/shared/schemas'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTokenService } from '../../src/features/auth'
import { makeCreateMatching, makeMatchingRepository } from '../../src/features/matchings'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })
const BASE = '/api/matchings'
const SHARE_TOKEN_BYTES = 16
const WRITES_PER_TEACHER_PER_MINUTE = 60
const INPUT: MatchingInput = {
  title: 'Животные',
  showAnswers: true,
  gradingScale: 'five',
  group: 'other',
  timer: { mode: 'stopwatch' },
  introTheme: 'nataskium-night',
  pairs: [
    { term: 'кот', definition: 'мяукает' },
    { term: 'пёс', definition: 'лает' },
  ],
}

let prisma: PrismaClient

type RequestOptions = { body?: unknown; teacherId?: string; app?: ReturnType<typeof createTestApp> }

// Новое приложение на каждый запрос (если не передано своё): счётчики лимитов не копятся между вызовами
async function request(method: string, path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = { origin: TEST_WEB_ORIGIN }
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (options.teacherId !== undefined) headers.authorization = `Bearer ${await tokens.signAccessToken(options.teacherId)}`
  const init = { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }
  return (options.app ?? createTestApp({ prisma })).request(path, init, fromIp())
}

async function createMatching(teacherId: string, input: unknown = INPUT) {
  const response = await request('POST', BASE, { teacherId, body: input })
  expect(response.status).toBe(201)
  return matchingResponseSchema.parse(await response.json()).matching
}

async function seedQuizzes(teacherId: string, count: number, deletedAt: Date | null = null) {
  await prisma.quiz.createMany({
    data: Array.from({ length: count }, () => ({
      teacherId,
      title: 'Викторина',
      shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
      questions: [],
      deletedAt,
    })),
  })
}

async function issuePaths(response: Response): Promise<string[]> {
  const body = (await response.json()) as { issues?: { path: string[] }[] }
  return (body.issues ?? []).map((issue) => issue.path.join('.'))
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

describe('/api/matchings', () => {
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

  it('создание, чтение, изменение и удаление', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createMatching(teacher.id)
    expect(created).toMatchObject({ title: INPUT.title, pairs: INPUT.pairs, timer: INPUT.timer, group: 'other' })
    expect(created).not.toHaveProperty('updatedAt')

    const got = await request('GET', `${BASE}/${created.id}`, { teacherId: teacher.id })
    expect(matchingResponseSchema.parse(await got.json()).matching).toEqual(created)

    const changed = { ...INPUT, title: 'Звуки', pairs: [...INPUT.pairs, { term: 'корова', definition: 'мычит' }] }
    const patched = await request('PATCH', `${BASE}/${created.id}`, { teacherId: teacher.id, body: changed })
    expect(patched.status).toBe(200)
    expect(matchingResponseSchema.parse(await patched.json()).matching).toMatchObject({ id: created.id, shareToken: created.shareToken, title: 'Звуки', pairs: changed.pairs })

    expect((await request('DELETE', `${BASE}/${created.id}`, { teacherId: teacher.id })).status).toBe(204)
    expect((await request('GET', `${BASE}/${created.id}`, { teacherId: teacher.id })).status).toBe(404)
    expect((await prisma.quiz.findUniqueOrThrow({ where: { id: created.id } })).deletedAt).not.toBeNull()
  })

  it('400: одна пара, дубль слова с путём, лишние поля; введённый текст в ответ не попадает', async () => {
    const teacher = await createTeacher(prisma)
    const onePair = await request('POST', BASE, { teacherId: teacher.id, body: { ...INPUT, pairs: [INPUT.pairs[0]] } })
    expect(onePair.status).toBe(400)
    expect(await issuePaths(onePair)).toEqual(['pairs'])

    const duplicate = { ...INPUT, pairs: [{ term: 'Секретное слово', definition: 'a' }, { term: 'секретное  слово', definition: 'b' }] }
    const duplicated = await request('POST', BASE, { teacherId: teacher.id, body: duplicate })
    expect(duplicated.status).toBe(400)
    const text = await duplicated.clone().text()
    expect(await issuePaths(duplicated)).toEqual(['pairs.1.term'])
    expect(text.toLowerCase()).not.toContain('секретное')

    const extra = await request('POST', BASE, { teacherId: teacher.id, body: { ...INPUT, questions: [] } })
    expect(extra.status).toBe(400)
    expect(await prisma.quiz.count()).toBe(0)
  })

  it('404 одинаковый: чужое, удалённое, несуществующее, невалидный id и id викторины', async () => {
    const owner = await createTeacher(prisma)
    const stranger = await createTeacher(prisma)
    const own = await createMatching(owner.id)
    const deleted = await createMatching(owner.id, { ...INPUT, title: 'Удалённое' })
    await request('DELETE', `${BASE}/${deleted.id}`, { teacherId: owner.id })
    const quiz = await prisma.quiz.create({
      data: { teacherId: owner.id, title: 'Викторина', shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'), questions: [] },
    })

    const cases: [string, string][] = [
      [stranger.id, own.id],
      [owner.id, deleted.id],
      [owner.id, randomUUID()],
      [owner.id, 'not-a-uuid'],
      [owner.id, quiz.id],
    ]
    for (const [teacherId, id] of cases) {
      for (const [method, body] of [['GET', undefined], ['PATCH', INPUT], ['DELETE', undefined]] as const) {
        const response = await request(method, `${BASE}/${id}`, { teacherId, body })
        expect(response.status, `${method} ${id}`).toBe(404)
        expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('Matching not found')
      }
    }
    const stillOwn = await prisma.quiz.findUniqueOrThrow({ where: { id: own.id } })
    expect(stillOwn).toMatchObject({ title: INPUT.title, deletedAt: null })
    expect((await prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id } })).deletedAt).toBeNull()
  })

  it(`409: лимит ${MAX_ACTIVITIES_PER_TEACHER} общий с викторинами, удалённые не считаются`, async () => {
    const teacher = await createTeacher(prisma)
    await seedQuizzes(teacher.id, MAX_ACTIVITIES_PER_TEACHER - 1)
    await seedQuizzes(teacher.id, 5, new Date())

    await createMatching(teacher.id)
    const over = await request('POST', BASE, { teacherId: teacher.id, body: INPUT })

    expect(over.status).toBe(409)
    expect(await prisma.quiz.count({ where: { teacherId: teacher.id, deletedAt: null } })).toBe(MAX_ACTIVITIES_PER_TEACHER)
  })

  it('удалённый аккаунт при действующем токене — 401', async () => {
    const teacher = await createTeacher(prisma)
    await prisma.teacher.delete({ where: { id: teacher.id } })

    expect((await request('POST', BASE, { teacherId: teacher.id, body: INPUT })).status).toBe(401)
    expect(await prisma.quiz.count()).toBe(0)
  })

  it('список GET /api/quizzes содержит сопоставление с type и числом пар', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createMatching(teacher.id)

    const response = await request('GET', '/api/quizzes', { teacherId: teacher.id })
    const { quizzes } = quizListResponseSchema.parse(await response.json())
    expect(quizzes).toEqual([
      { id: created.id, type: 'matching', title: INPUT.title, questionCount: INPUT.pairs.length, gradingScale: 'five', shareToken: created.shareToken },
    ])
  })

  it('созданное через маршрут публикуется, копия (isPublic: false) — нет', async () => {
    const teacher = await createTeacher(prisma)
    const published = await createMatching(teacher.id)
    const copy = await makeCreateMatching({ matchings: makeMatchingRepository(prisma) })(teacher.id, INPUT, { isPublic: false })

    const rows = await prisma.quiz.findMany({ select: { id: true, type: true, isPublic: true } })
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: published.id, type: 'matching', isPublic: true },
        { id: copy.id, type: 'matching', isPublic: false },
      ]),
    )
  })

  it('updatedAt из findOwned — значение колонки updated_at (из него шаг 6 строит version)', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createMatching(teacher.id)

    const stored = await makeMatchingRepository(prisma).findOwned(created.id, teacher.id)
    const row = await prisma.quiz.findUniqueOrThrow({ where: { id: created.id }, select: { updatedAt: true } })
    expect(stored?.updatedAt.toISOString()).toBe(row.updatedAt.toISOString())
  })

  it('строка, не прошедшая схему, — общий 500 без текста исключения', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const teacher = await createTeacher(prisma)
    // Проходит CHECK базы (2 пары), но не Zod: слова совпадают
    const broken = await prisma.quiz.create({
      data: {
        teacherId: teacher.id,
        type: 'matching',
        title: 'Сломанное',
        shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
        questions: [{ term: 'кот', definition: 'a' }, { term: 'кот', definition: 'b' }],
      },
    })

    const response = await request('GET', `${BASE}/${broken.id}`, { teacherId: teacher.id })

    expect(response.status).toBe(500)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ error: 'Internal Server Error' })
    expect(text).not.toContain(broken.id)
    expect(text).not.toContain('schema')
  })

  it('лимит записи общий с викторинами: запросы к /api/quizzes расходуют квоту /api/matchings', async () => {
    const teacher = await createTeacher(prisma)
    const app = createTestApp({ prisma })
    for (let i = 0; i < WRITES_PER_TEACHER_PER_MINUTE; i++) {
      expect((await request('DELETE', `/api/quizzes/${randomUUID()}`, { teacherId: teacher.id, app })).status).toBe(404)
    }

    expect((await request('DELETE', `${BASE}/${randomUUID()}`, { teacherId: teacher.id, app })).status).toBe(429)
  })

  it('429 на создании: дневной лимит POST общий с викторинами; 100 создано — дальше 409, потом 429', async () => {
    const MS_PER_MINUTE = 60 * 1000
    const CREATES_PER_DAY = 200
    const REQUESTS_PER_MINUTE_WINDOW = 50
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() })
    try {
      const teacher = await createTeacher(prisma)
      const app = createTestApp({ prisma })
      const statuses: number[] = []
      for (let i = 0; i < CREATES_PER_DAY; i++) {
        // Минутная квота записи (60) не должна сработать раньше дневной: сдвигаем время
        if (i % REQUESTS_PER_MINUTE_WINDOW === 0) vi.setSystemTime(Date.now() + MS_PER_MINUTE)
        statuses.push((await request('POST', BASE, { teacherId: teacher.id, body: INPUT, app })).status)
      }
      expect(statuses.slice(0, MAX_ACTIVITIES_PER_TEACHER).every((status) => status === 201)).toBe(true)
      expect(statuses.slice(MAX_ACTIVITIES_PER_TEACHER).every((status) => status === 409)).toBe(true)

      vi.setSystemTime(Date.now() + MS_PER_MINUTE)
      expect((await request('POST', BASE, { teacherId: teacher.id, body: INPUT, app })).status).toBe(429)
    } finally {
      vi.useRealTimers()
    }
  })

  it('тело больше 100 КБ — 413 в нашем формате, строка не создана', async () => {
    const teacher = await createTeacher(prisma)
    const huge = { ...INPUT, pairs: [{ term: 'кот', definition: 'x'.repeat(200_000) }, INPUT.pairs[1]] }

    const response = await request('POST', BASE, { teacherId: teacher.id, body: huge })

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'Payload Too Large' })
    expect(await prisma.quiz.count()).toBe(0)
  })

  it('пустое тело, не-JSON и без Content-Type — 400', async () => {
    const teacher = await createTeacher(prisma)
    const app = createTestApp({ prisma })
    const authorization = `Bearer ${await tokens.signAccessToken(teacher.id)}`
    const variants: HeadersInit[] = [
      { origin: TEST_WEB_ORIGIN, authorization, 'content-type': 'application/json' },
      { origin: TEST_WEB_ORIGIN, authorization },
    ]
    for (const headers of variants) {
      const response = await app.request(BASE, { method: 'POST', headers }, fromIp())
      expect(response.status).toBe(400)
    }
    const notJson = await app.request(BASE, { method: 'POST', headers: { origin: TEST_WEB_ORIGIN, authorization, 'content-type': 'application/json' }, body: '{не json' }, fromIp())
    expect(notJson.status).toBe(400)
    expect(await prisma.quiz.count()).toBe(0)
  })

  it('PATCH с неизвестной группой — 400, запись не изменена', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createMatching(teacher.id)

    const response = await request('PATCH', `${BASE}/${created.id}`, { teacherId: teacher.id, body: { ...INPUT, title: 'Новое', group: 'missing' } })

    expect(response.status).toBe(400)
    const row = await prisma.quiz.findUniqueOrThrow({ where: { id: created.id } })
    expect(row).toMatchObject({ title: INPUT.title, groupSlug: 'other' })
  })

  it('PATCH чужого с другим названием и парами не меняет запись владельца', async () => {
    const owner = await createTeacher(prisma)
    const stranger = await createTeacher(prisma)
    const created = await createMatching(owner.id)

    const response = await request('PATCH', `${BASE}/${created.id}`, {
      teacherId: stranger.id,
      body: { ...INPUT, title: 'Чужое', pairs: [{ term: 'x', definition: 'y' }, { term: 'z', definition: 'w' }] },
    })

    expect(response.status).toBe(404)
    const row = await prisma.quiz.findUniqueOrThrow({ where: { id: created.id } })
    expect(row).toMatchObject({ title: INPUT.title, questions: INPUT.pairs })
  })

  it('слово 61 символ — 400 с путём pairs.0.term; определение 201 — pairs.0.definition', async () => {
    const teacher = await createTeacher(prisma)
    const longTerm = await request('POST', BASE, {
      teacherId: teacher.id,
      body: { ...INPUT, pairs: [{ term: 'a'.repeat(61), definition: 'A' }, INPUT.pairs[1]] },
    })
    expect(longTerm.status).toBe(400)
    expect(await issuePaths(longTerm)).toContain('pairs.0.term')

    const longDefinition = await request('POST', BASE, {
      teacherId: teacher.id,
      body: { ...INPUT, pairs: [{ term: 'a', definition: 'A'.repeat(201) }, INPUT.pairs[1]] },
    })
    expect(longDefinition.status).toBe(400)
    expect(await issuePaths(longDefinition)).toContain('pairs.0.definition')
    expect(await prisma.quiz.count()).toBe(0)
  })

  it('управляющий символ, bidi и перевод строки в паре — 400 с путём', async () => {
    const teacher = await createTeacher(prisma)
    for (const bad of ['a\u0007b', 'a‮b', 'a\nb']) {
      const response = await request('POST', BASE, {
        teacherId: teacher.id,
        body: { ...INPUT, pairs: [{ term: bad, definition: 'A' }, INPUT.pairs[1]] },
      })
      expect(response.status).toBe(400)
      expect(await issuePaths(response)).toContain('pairs.0.term')
    }
    expect(await prisma.quiz.count()).toBe(0)
  })

  it('визуальный стиль: сохраняется в базе и меняется PATCH; без поля — стиль по умолчанию; неизвестный — 400', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createMatching(teacher.id, { ...INPUT, introTheme: 'nataskium-day' })
    expect(created.introTheme).toBe('nataskium-day')
    expect(await prisma.quiz.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ introTheme: 'nataskium-day' })

    const patched = await request('PATCH', `${BASE}/${created.id}`, { teacherId: teacher.id, body: { ...INPUT, introTheme: 'nataskium-night' } })
    expect(matchingResponseSchema.parse(await patched.json()).matching.introTheme).toBe('nataskium-night')

    const withoutTheme: Partial<typeof INPUT> = { ...INPUT }
    delete withoutTheme.introTheme
    expect((await createMatching(teacher.id, withoutTheme)).introTheme).toBe('nataskium-night')
    const before = await prisma.quiz.count()
    for (const introTheme of ['neon', 'Nataskium-Day', '', null]) {
      const response = await request('POST', BASE, { teacherId: teacher.id, body: { ...INPUT, introTheme } })
      expect(response.status).toBe(400)
      expect(await issuePaths(response)).toContain('introTheme')
    }
    expect(await prisma.quiz.count()).toBe(before)
  })

  it('ответ POST не содержит teacherId, isPublic, publicNumber, updatedAt и кода привязки', async () => {
    const teacher = await createTeacher(prisma)
    const response = await request('POST', BASE, { teacherId: teacher.id, body: INPUT })

    expect(response.status).toBe(201)
    const body = (await response.json()) as Record<string, unknown>
    expect(Object.keys(body)).toEqual(['matching'])
    expect(Object.keys(body.matching as object).sort()).toEqual(['gradingScale', 'group', 'id', 'introTheme', 'pairs', 'shareToken', 'showAnswers', 'timer', 'title'])
    expect(JSON.stringify(body)).not.toContain(teacher.id)
  })
})
