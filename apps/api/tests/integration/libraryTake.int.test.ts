import { randomBytes, randomUUID } from 'node:crypto'
import { MAX_QUIZZES_PER_TEACHER, quizListResponseSchema, quizResponseSchema } from '@nataskium/shared/schemas'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { ExternalServiceError } from '../../src/shared/errors'
import type { ImageStorage } from '../../src/shared/infrastructure'
import { MEMORY_IMAGES_BASE_URL, makeMemoryImageStorage } from '../fakes/memoryImageStorage'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })
const LIBRARY = '/api/library'
const TAKE_PER_TEACHER_PER_HOUR = 30
const TAKE_PER_IP_PER_HOUR = 100
const NOT_FOUND_NUMBER = 999_999
const SHARE_TOKEN_LENGTH = 22
const IMAGE_BODY = new Uint8Array([7, 7, 7])
const imageKey = (imageId: string) => `quiz-images/${imageId}.webp`

let prisma: PrismaClient
let imageStorage: ImageStorage | null = null

async function auth(teacherId: string) {
  return { authorization: `Bearer ${await tokens.signAccessToken(teacherId)}` }
}

function request(app: ReturnType<typeof createTestApp>, method: string, path: string, headers: Record<string, string>, ip?: string) {
  return app.request(path, { method, headers: { origin: TEST_WEB_ORIGIN, ...headers } }, fromIp(ip))
}

// Новое приложение на каждый запрос: счётчики лимитов не копятся между вызовами; тесты лимитов берут один экземпляр
function take(number: number | string, headers: Record<string, string>) {
  return request(createTestApp({ prisma, imageStorage }), 'POST', `${LIBRARY}/${number}/take`, headers)
}

function get(path: string, headers: Record<string, string> = {}) {
  return request(createTestApp({ prisma, imageStorage }), 'GET', path, headers)
}

type SourceOptions = { isPublic?: boolean; deletedAt?: Date | null; moderationHiddenAt?: Date | null; withImages?: boolean }

// Публичное задание автора; при withImages — картинка вопроса и картинка варианта: строки автора, привязанные к заданию, и файлы
async function seedSource(storage: ReturnType<typeof makeMemoryImageStorage> | null, authorId: string, options: SourceOptions = {}) {
  const imageIds = options.withImages === true ? [randomUUID(), randomUUID()] : []
  const [questionImage = null, optionImage = null] = imageIds
  const quiz = await prisma.quiz.create({
    data: {
      teacherId: authorId,
      shareToken: randomBytes(16).toString('base64url'),
      title: 'Столицы',
      showAnswers: false,
      gradingScale: 'five',
      groupSlug: 'other',
      isPublic: options.isPublic ?? true,
      deletedAt: options.deletedAt ?? null,
      moderationHiddenAt: options.moderationHiddenAt ?? null,
      questions: [
        {
          text: 'Столица Франции?',
          imageId: questionImage,
          options: [
            { text: 'Париж', isCorrect: true, imageId: optionImage },
            { text: 'Рим', isCorrect: false, imageId: null },
          ],
        },
      ],
    },
  })
  for (const id of imageIds) {
    await prisma.quizImage.create({ data: { id, teacherId: authorId, quizId: quiz.id } })
    await storage?.storage.put(imageKey(id), IMAGE_BODY, 'image/webp')
  }
  return { quiz, imageIds }
}

async function fillQuizzes(teacherId: string, count: number) {
  await prisma.quiz.createMany({
    data: Array.from({ length: count }, () => ({
      teacherId,
      shareToken: randomBytes(16).toString('base64url'),
      title: 'Тест',
      showAnswers: true,
      gradingScale: null,
      isPublic: false,
      questions: [],
    })),
  })
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})
beforeEach(async () => {
  await truncateAll(prisma)
  imageStorage = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})
afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('POST /api/library/:number/take', () => {
  it('без токена и с мусорным токеном — 401, копии нет', async () => {
    const author = await createTeacher(prisma)
    const { quiz } = await seedSource(null, author.id)
    expect((await take(quiz.publicNumber, {})).status).toBe(401)
    expect((await take(quiz.publicNumber, { authorization: 'Bearer not-a-token' })).status).toBe(401)
    expect(await prisma.quiz.count()).toBe(1)
  })

  it('без картинок: 201 { quizId }; копия учителя с новым shareToken, isPublic=false, содержимое то же', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const { quiz: source } = await seedSource(null, author.id)

    const response = await take(source.publicNumber, await auth(taker.id))

    expect(response.status).toBe(201)
    const body = (await response.json()) as Record<string, unknown>
    expect(Object.keys(body)).toEqual(['quizId'])
    const copy = await prisma.quiz.findUniqueOrThrow({ where: { id: body.quizId as string } })
    expect(copy).toMatchObject({
      teacherId: taker.id,
      title: 'Столицы',
      showAnswers: false,
      gradingScale: 'five',
      groupSlug: 'other',
      isPublic: false,
      deletedAt: null,
      moderationHiddenAt: null,
    })
    expect(copy.id).not.toBe(source.id)
    expect(copy.shareToken).not.toBe(source.shareToken)
    expect(copy.shareToken).toHaveLength(SHARE_TOKEN_LENGTH)
    expect(copy.publicNumber).not.toBe(source.publicNumber)
    expect(copy.questions).toEqual(source.questions)
    // источник не тронут
    expect(await prisma.quiz.findUniqueOrThrow({ where: { id: source.id } })).toMatchObject({ teacherId: author.id, isPublic: true })
  })

  it('копия видна взявшему в «Моих заданиях», но не видна в библиотеке и по своему номеру; чужой учитель её не читает', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const stranger = await createTeacher(prisma)
    const { quiz: source } = await seedSource(null, author.id)

    const { quizId } = (await (await take(source.publicNumber, await auth(taker.id))).json()) as { quizId: string }
    const copy = await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })

    const mine = quizListResponseSchema.parse(await (await get('/api/quizzes', await auth(taker.id))).json())
    expect(mine.quizzes.map((q) => q.id)).toEqual([quizId])
    expect(mine.quizzes[0]!.shareToken).toBe(copy.shareToken)

    const library = (await (await get(LIBRARY)).json()) as { quizzes: { number: number }[] }
    expect(library.quizzes.map((q) => q.number)).toEqual([source.publicNumber])
    expect((await get(`${LIBRARY}/${copy.publicNumber}`)).status).toBe(404)
    expect((await take(copy.publicNumber, await auth(stranger.id))).status).toBe(404)

    expect((await get(`/api/quizzes/${quizId}`, await auth(stranger.id))).status).toBe(404)
    expect((await get(`/api/quizzes/${quizId}`, await auth(taker.id))).status).toBe(200)
  })

  it.each([
    ['несуществующий номер', () => ({ number: NOT_FOUND_NUMBER })],
    ['непубличное', () => ({ isPublic: false })],
    ['удалённое автором', () => ({ deletedAt: new Date() })],
    ['скрытое модерацией', () => ({ moderationHiddenAt: new Date() })],
  ])('%s → 404, одинаковый ответ, ничего не создано', async (_name, make) => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const storage = makeMemoryImageStorage()
    imageStorage = storage.storage
    const { quiz } = await seedSource(storage, author.id, { ...make(), withImages: true })
    const number = 'number' in make() ? NOT_FOUND_NUMBER : quiz.publicNumber
    const reference = await take(NOT_FOUND_NUMBER, await auth(taker.id))
    const quizzesBefore = await prisma.quiz.count()
    const rowsBefore = await prisma.quizImage.count()

    const response = await take(number, await auth(taker.id))

    expect(response.status).toBe(404)
    expect(await response.text()).toBe(await reference.text())
    expect(await prisma.quiz.count()).toBe(quizzesBefore)
    expect(await prisma.quizImage.count()).toBe(rowsBefore)
    expect(storage.calls.copy).toBe(0)
  })

  it.each(['abc', '0', '-1', '1.5', '99999999999999999999999999'])('невалидный номер %s → 404, не 400 и не 500', async (raw) => {
    const taker = await createTeacher(prisma)
    expect((await take(raw, await auth(taker.id))).status).toBe(404)
  })

  it('с картинками: все imageId новые, строки у взявшего и привязаны к копии, файлы скопированы, источник цел', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const storage = makeMemoryImageStorage()
    imageStorage = storage.storage
    const { quiz: source, imageIds: oldIds } = await seedSource(storage, author.id, { withImages: true })

    const response = await take(source.publicNumber, await auth(taker.id))

    expect(response.status).toBe(201)
    const { quizId } = (await response.json()) as { quizId: string }
    const copy = await prisma.quiz.findUniqueOrThrow({ where: { id: quizId } })
    const [question] = copy.questions as { imageId: string | null; options: { imageId: string | null }[] }[]
    const newIds = [question!.imageId, question!.options[0]!.imageId]
    expect(newIds.every((id) => id !== null)).toBe(true)
    expect(new Set(newIds).size).toBe(2)
    for (const oldId of oldIds) expect(newIds).not.toContain(oldId)

    const copyRows = await prisma.quizImage.findMany({ where: { quizId } })
    expect(copyRows.map((r) => r.id).sort()).toEqual([...(newIds as string[])].sort())
    expect(copyRows.every((r) => r.teacherId === taker.id)).toBe(true)
    for (const id of newIds as string[]) {
      expect(storage.objects.get(imageKey(id))?.body).toEqual(IMAGE_BODY)
    }
    // у источника строки и файлы на прежних местах
    const sourceRows = await prisma.quizImage.findMany({ where: { quizId: source.id } })
    expect(sourceRows.map((r) => r.id).sort()).toEqual([...oldIds].sort())
    expect(sourceRows.every((r) => r.teacherId === author.id)).toBe(true)
    for (const id of oldIds) expect(storage.objects.has(imageKey(id))).toBe(true)
    expect(await prisma.quizImage.count()).toBe(4)

    // взявший читает копию с адресами новых файлов
    const got = quizResponseSchema.parse(await (await get(`/api/quizzes/${quizId}`, await auth(taker.id))).json())
    expect(got.quiz.questions[0]!.imageUrl).toBe(`${MEMORY_IMAGES_BASE_URL}/${imageKey(newIds[0] as string)}`)
  })

  it('источник удалён автором, а аккаунт автора удалён с его картинками: у копии строки и файлы на месте', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const storage = makeMemoryImageStorage()
    imageStorage = storage.storage
    const { quiz: source, imageIds: oldIds } = await seedSource(storage, author.id, { withImages: true })
    const { quizId } = (await (await take(source.publicNumber, await auth(taker.id))).json()) as { quizId: string }
    const copyRowsBefore = await prisma.quizImage.findMany({ where: { quizId }, orderBy: { id: 'asc' } })
    expect(copyRowsBefore).toHaveLength(2)

    // то же, что делает удаление аккаунта: учитель удаляется каскадом, его файлы убираются из хранилища
    await storage.storage.remove(oldIds.map(imageKey))
    await prisma.teacher.delete({ where: { id: author.id } })

    expect(await prisma.quiz.findUnique({ where: { id: source.id } })).toBeNull()
    expect(await prisma.quizImage.findMany({ where: { quizId }, orderBy: { id: 'asc' } })).toEqual(copyRowsBefore)
    for (const row of copyRowsBefore) expect(storage.objects.has(imageKey(row.id))).toBe(true)
    expect((await get(`/api/quizzes/${quizId}`, await auth(taker.id))).status).toBe(200)
    expect(await prisma.quizImage.count()).toBe(2)
  })

  it('аккаунт автора удалён: его карточка и строка в списке библиотеки исчезают, ответ — обычный 404', async () => {
    const author = await createTeacher(prisma)
    const other = await createTeacher(prisma)
    const { quiz: mine } = await seedSource(null, author.id)
    const { quiz: foreign } = await seedSource(null, other.id)
    expect((await get(`${LIBRARY}/${mine.publicNumber}`)).status).toBe(200)
    const listedBefore = (await (await get(`${LIBRARY}?group=other`)).json()) as { quizzes: { number: number }[] }
    expect(listedBefore.quizzes.map((item) => item.number)).toContain(mine.publicNumber)

    await prisma.teacher.delete({ where: { id: author.id } })

    const card = await get(`${LIBRARY}/${mine.publicNumber}`)
    const unknown = await get(`${LIBRARY}/${NOT_FOUND_NUMBER}`)
    expect(card.status).toBe(404)
    // Неотличим от несуществующего номера: по ответу не понять, что задание было
    expect(await card.json()).toEqual(await unknown.json())
    const listedAfter = (await (await get(`${LIBRARY}?group=other`)).json()) as { quizzes: { number: number }[] }
    expect(listedAfter.quizzes.map((item) => item.number)).not.toContain(mine.publicNumber)
    // Чужое задание не затронуто
    expect(listedAfter.quizzes.map((item) => item.number)).toContain(foreign.publicNumber)
    expect((await get(`${LIBRARY}/${foreign.publicNumber}`)).status).toBe(200)
  })

  it('хранилище не настроено и картинки есть → 503, копии нет; без картинок — 201', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const { quiz: withImages } = await seedSource(null, author.id, { withImages: true })
    const { quiz: plain } = await seedSource(null, author.id)

    expect((await take(withImages.publicNumber, await auth(taker.id))).status).toBe(503)
    expect(await prisma.quiz.count({ where: { teacherId: taker.id } })).toBe(0)
    expect(await prisma.quizImage.count({ where: { teacherId: taker.id } })).toBe(0)

    expect((await take(plain.publicNumber, await auth(taker.id))).status).toBe(201)
  })

  it('лимит 100 заданий → 409, файлы не копируются; удалённое в лимит не входит', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const storage = makeMemoryImageStorage()
    imageStorage = storage.storage
    const { quiz: source } = await seedSource(storage, author.id, { withImages: true })
    await fillQuizzes(taker.id, MAX_QUIZZES_PER_TEACHER)
    const rowsBefore = await prisma.quizImage.count()

    expect((await take(source.publicNumber, await auth(taker.id))).status).toBe(409)
    expect(storage.calls.copy).toBe(0)
    expect(await prisma.quizImage.count()).toBe(rowsBefore)
    expect(await prisma.quiz.count({ where: { teacherId: taker.id } })).toBe(MAX_QUIZZES_PER_TEACHER)

    const [first] = await prisma.quiz.findMany({ where: { teacherId: taker.id }, take: 1 })
    await prisma.quiz.update({ where: { id: first!.id }, data: { deletedAt: new Date() } })
    expect((await take(source.publicNumber, await auth(taker.id))).status).toBe(201)
  })

  it('99 заданий — 201 и ровно 100 после', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const { quiz } = await seedSource(null, author.id)
    await fillQuizzes(taker.id, MAX_QUIZZES_PER_TEACHER - 1)
    expect((await take(quiz.publicNumber, await auth(taker.id))).status).toBe(201)
    expect(await prisma.quiz.count({ where: { teacherId: taker.id, deletedAt: null } })).toBe(MAX_QUIZZES_PER_TEACHER)
  })

  it('сбой копирования на первом файле → 503, ни копии, ни строк, ни лишних файлов', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const storage = makeMemoryImageStorage()
    imageStorage = storage.storage
    const { quiz: source, imageIds } = await seedSource(storage, author.id, { withImages: true })
    storage.failing.copy = true
    const objectsBefore = [...storage.objects.keys()].sort()

    expect((await take(source.publicNumber, await auth(taker.id))).status).toBe(503)

    expect(await prisma.quiz.count({ where: { teacherId: taker.id } })).toBe(0)
    expect(await prisma.quizImage.count({ where: { teacherId: taker.id } })).toBe(0)
    expect([...storage.objects.keys()].sort()).toEqual(objectsBefore)
    for (const id of imageIds) expect(storage.objects.has(imageKey(id))).toBe(true)
  })

  it('сбой на втором файле → уже скопированный файл и его строка убраны', async () => {
    const author = await createTeacher(prisma)
    const taker = await createTeacher(prisma)
    const storage = makeMemoryImageStorage()
    // Копирование идёт по 4 в потоке: первый copy проходит, второй падает
    let calls = 0
    imageStorage = {
      ...storage.storage,
      async copy(fromKey, toKey) {
        calls++
        if (calls >= 2) throw new ExternalServiceError('memory-storage', 500)
        await storage.storage.copy(fromKey, toKey)
      },
    }
    const { quiz: source } = await seedSource(storage, author.id, { withImages: true })
    const objectsBefore = [...storage.objects.keys()].sort()

    expect((await take(source.publicNumber, await auth(taker.id))).status).toBe(503)

    expect(calls).toBeGreaterThanOrEqual(2)
    expect(await prisma.quiz.count({ where: { teacherId: taker.id } })).toBe(0)
    expect(await prisma.quizImage.count({ where: { teacherId: taker.id } })).toBe(0)
    expect([...storage.objects.keys()].sort()).toEqual(objectsBefore)
  })

  it('лимит на учителя: 30 в час, 31-й — 429 с Retry-After; другой учитель не затронут', async () => {
    const taker = await createTeacher(prisma)
    const other = await createTeacher(prisma)
    const app = createTestApp({ prisma, imageStorage })
    const headers = await auth(taker.id)

    // разные IP, чтобы упереться именно в лимит учителя
    for (let i = 0; i < TAKE_PER_TEACHER_PER_HOUR; i++) {
      expect((await request(app, 'POST', `${LIBRARY}/${NOT_FOUND_NUMBER}/take`, headers, `10.0.0.${i + 1}`)).status).toBe(404)
    }
    const limited = await request(app, 'POST', `${LIBRARY}/${NOT_FOUND_NUMBER}/take`, headers, '10.0.1.1')
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)

    const otherResponse = await request(app, 'POST', `${LIBRARY}/${NOT_FOUND_NUMBER}/take`, await auth(other.id), '10.0.1.2')
    expect(otherResponse.status).toBe(404)
  })

  it('лимит на IP: 100 в час, 101-й — 429 с Retry-After, раньше проверки токена', async () => {
    const app = createTestApp({ prisma, imageStorage })

    for (let i = 0; i < TAKE_PER_IP_PER_HOUR; i++) {
      expect((await request(app, 'POST', `${LIBRARY}/${NOT_FOUND_NUMBER}/take`, {}, '10.0.2.1')).status).toBe(401)
    }
    const limited = await request(app, 'POST', `${LIBRARY}/${NOT_FOUND_NUMBER}/take`, {}, '10.0.2.1')
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)

    expect((await request(app, 'POST', `${LIBRARY}/${NOT_FOUND_NUMBER}/take`, {}, '10.0.2.2')).status).toBe(401)
  })
})
