import { randomBytes } from 'node:crypto'
import { type TrueFalseInput, libraryListResponseSchema, playTrueFalseFinishResponseSchema, playTrueFalseResponseSchema, trueFalseResponseSchema } from '@nataskium/shared/schemas'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTeacherRepository, makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })
const MAX_ITEMS = 30
const MAX_STATEMENT = 200
// updatedAt хранится с точностью до миллисекунды: ждём, чтобы версия точно сменилась
const VERSION_TICK_MS = 15
const SHARE_TOKEN_BYTES = 16

const itemsOf = (count: number, statement = (i: number) => 'Утверждение ' + i) => Array.from({ length: count }, (_, i) => ({ statement: statement(i), answer: i % 2 === 0 }))
const inputOf = (items: { statement: string; answer: boolean }[], overrides: Partial<TrueFalseInput> = {}): TrueFalseInput => ({
  title: 'Факты',
  showAnswers: true,
  gradingScale: 'five',
  group: 'other',
  timer: { mode: 'none' },
  introTheme: 'nataskium-night',
  items,
  ...overrides,
})

let prisma: PrismaClient

async function request(method: string, path: string, options: { body?: unknown; teacherId?: string } = {}) {
  const headers: Record<string, string> = { origin: TEST_WEB_ORIGIN }
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (options.teacherId !== undefined) headers.authorization = 'Bearer ' + (await tokens.signAccessToken(options.teacherId))
  const init = { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }
  return createTestApp({ prisma }).request(path, init, fromIp())
}

async function create(teacherId: string, input: TrueFalseInput) {
  const response = await request('POST', '/api/true-false', { teacherId, body: input })
  return { status: response.status, response }
}

async function createOk(teacherId: string, input: TrueFalseInput) {
  const { status, response } = await create(teacherId, input)
  expect(status).toBe(201)
  return trueFalseResponseSchema.parse(await response.json()).trueFalse
}

async function playVersion(shareToken: string) {
  return playTrueFalseResponseSchema.parse(await (await request('GET', '/api/play/' + shareToken)).json()).trueFalse.version
}

const finish = (token: string, body: unknown) => request('POST', '/api/play/' + token + '/true-false/finish', { body })
const check = (token: string, body: unknown) => request('POST', '/api/play/' + token + '/true-false/check', { body })

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

describe('да/нет: границы числа утверждений через маршруты', () => {
  it.each([2, MAX_ITEMS])('%i утверждений: создание, игра и finish с полным набором верных', async (count) => {
    const teacher = await createTeacher(prisma)
    const items = itemsOf(count)
    const created = await createOk(teacher.id, inputOf(items))

    const version = await playVersion(created.shareToken)
    const response = await finish(created.shareToken, { version, answers: items.map((item) => item.answer) })

    expect(response.status).toBe(200)
    expect(playTrueFalseFinishResponseSchema.parse(await response.json()).result).toMatchObject({ percent: 100, grade: '5', correctCount: count, totalCount: count })
  })

  it('1 и 31 утверждение — 400, ничего не записано', async () => {
    const teacher = await createTeacher(prisma)

    expect((await create(teacher.id, inputOf(itemsOf(1)))).status).toBe(400)
    expect((await create(teacher.id, inputOf(itemsOf(MAX_ITEMS + 1)))).status).toBe(400)
    expect(await prisma.quiz.count()).toBe(0)
  })

  it('утверждение ровно в 200 знаков принимается и доходит до ученика целиком; 201 — 400', async () => {
    const teacher = await createTeacher(prisma)
    const long = (i: number) => String(i).padStart(2, '0') + 'я'.repeat(MAX_STATEMENT - 2)
    const created = await createOk(teacher.id, inputOf(itemsOf(2, long)))

    const play = playTrueFalseResponseSchema.parse(await (await request('GET', '/api/play/' + created.shareToken)).json())

    expect(play.trueFalse.statements).toEqual([long(0), long(1)])
    expect((await create(teacher.id, inputOf(itemsOf(2, (i) => (i === 0 ? 'я'.repeat(MAX_STATEMENT + 1) : 'коротко'))))).status).toBe(400)
  })

  it('граничные 2 и 30 утверждений проходят и через PATCH; 1 и 31 — 400, содержимое не меняется', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createOk(teacher.id, inputOf(itemsOf(3)))
    const patch = (items: { statement: string; answer: boolean }[]) => request('PATCH', '/api/true-false/' + created.id, { teacherId: teacher.id, body: inputOf(items) })

    expect((await patch(itemsOf(MAX_ITEMS))).status).toBe(200)
    expect((await patch(itemsOf(2))).status).toBe(200)
    expect((await patch(itemsOf(1))).status).toBe(400)
    expect((await patch(itemsOf(MAX_ITEMS + 1))).status).toBe(400)
    expect((await prisma.quiz.findUniqueOrThrow({ where: { id: created.id } })).questions).toEqual(itemsOf(2))
  })
})

describe('да/нет: изменение и удаление во время игры', () => {
  it('PATCH меняет version: finish и check со старой версией — 409, с новой — 200', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createOk(teacher.id, inputOf(itemsOf(3)))
    const oldVersion = await playVersion(created.shareToken)

    await new Promise((resolve) => setTimeout(resolve, VERSION_TICK_MS))
    const patched = await request('PATCH', '/api/true-false/' + created.id, { teacherId: teacher.id, body: inputOf(itemsOf(3), { title: 'Новое' }) })
    expect(patched.status).toBe(200)

    const newVersion = await playVersion(created.shareToken)
    expect(newVersion).not.toBe(oldVersion)
    expect((await finish(created.shareToken, { version: oldVersion, answers: [true, false, true] })).status).toBe(409)
    expect((await check(created.shareToken, { version: oldVersion, index: 0, answer: true })).status).toBe(409)
    expect((await finish(created.shareToken, { version: newVersion, answers: [true, false, true] })).status).toBe(200)
    expect((await check(created.shareToken, { version: newVersion, index: 0, answer: true })).status).toBe(200)
  })

  it('изменение числа утверждений в ходе игры: старая версия — 409 раньше, чем проверка длины', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createOk(teacher.id, inputOf(itemsOf(3)))
    const oldVersion = await playVersion(created.shareToken)

    await new Promise((resolve) => setTimeout(resolve, VERSION_TICK_MS))
    await request('PATCH', '/api/true-false/' + created.id, { teacherId: teacher.id, body: inputOf(itemsOf(4)) })

    expect((await finish(created.shareToken, { version: oldVersion, answers: [true, false, true] })).status).toBe(409)
  })

  it('удаление во время игры: finish и check — 404, GET — 404', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createOk(teacher.id, inputOf(itemsOf(3)))
    const version = await playVersion(created.shareToken)

    expect((await request('DELETE', '/api/true-false/' + created.id, { teacherId: teacher.id })).status).toBe(204)

    expect((await finish(created.shareToken, { version, answers: [true, false, true] })).status).toBe(404)
    expect((await check(created.shareToken, { version, index: 0, answer: true })).status).toBe(404)
    expect((await request('GET', '/api/play/' + created.shareToken)).status).toBe(404)
  })

  it('finish ничего не пишет в БД', async () => {
    const teacher = await createTeacher(prisma)
    const created = await createOk(teacher.id, inputOf(itemsOf(3)))
    const version = await playVersion(created.shareToken)
    const before = await prisma.quiz.findUniqueOrThrow({ where: { id: created.id } })

    await finish(created.shareToken, { version, answers: [null, null, null] })
    await check(created.shareToken, { version, index: 0, answer: true })

    expect(await prisma.quiz.findUniqueOrThrow({ where: { id: created.id } })).toEqual(before)
    expect(await prisma.quiz.count()).toBe(1)
  })
})

describe('да/нет: удаление аккаунта (GDPR)', () => {
  it('deleteAccount удаляет строки да/нет учителя физически, чужие остаются', async () => {
    const owner = await createTeacher(prisma, 'qa-owner@example.test')
    const other = await createTeacher(prisma)
    await createOk(owner.id, inputOf(itemsOf(3)))
    await createOk(owner.id, inputOf(itemsOf(4)))
    const foreign = await createOk(other.id, inputOf(itemsOf(2)))
    // Мягко удалённое задание тоже содержит персональный контент учителя
    const soft = await createOk(owner.id, inputOf(itemsOf(2)))
    await prisma.quiz.update({ where: { id: soft.id }, data: { deletedAt: new Date() } })

    expect(await makeTeacherRepository(prisma).deleteAccount(owner.id, 'qa-owner@example.test')).toBe(true)

    expect(await prisma.quiz.count({ where: { teacherId: owner.id } })).toBe(0)
    expect(await prisma.quiz.findMany({ select: { id: true } })).toEqual([{ id: foreign.id }])
  })

  it('после удаления аккаунта ссылка ученика — 404', async () => {
    const owner = await createTeacher(prisma, 'qa-owner2@example.test')
    const created = await createOk(owner.id, inputOf(itemsOf(3)))
    const version = await playVersion(created.shareToken)

    await makeTeacherRepository(prisma).deleteAccount(owner.id, 'qa-owner2@example.test')

    expect((await finish(created.shareToken, { version, answers: [true, false, true] })).status).toBe(404)
  })
})

describe('да/нет: поиск в библиотеке', () => {
  async function seedPublic(teacherId: string, title: string, type: 'truefalse' | 'matching' = 'truefalse') {
    return prisma.quiz.create({
      data: {
        teacherId,
        type,
        title,
        shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
        questions: type === 'truefalse' ? itemsOf(2) : [{ term: 'кот', definition: 'мяукает' }, { term: 'пёс', definition: 'лает' }],
      },
    })
  }

  it('q находит да/нет по названию, без учёта регистра, вместе с другими типами; type в ответе', async () => {
    const author = await createTeacher(prisma)
    await seedPublic(author.id, 'Планеты: да или нет')
    await seedPublic(author.id, 'Планеты: пары', 'matching')
    await seedPublic(author.id, 'Реки')

    const response = await request('GET', '/api/library?q=%D0%BF%D0%BB%D0%B0%D0%BD%D0%B5%D1%82%D1%8B')
    const { quizzes } = libraryListResponseSchema.parse(await response.json())

    expect(quizzes.map(({ title, type }) => ({ title, type })).sort((a, b) => a.title.localeCompare(b.title))).toEqual([
      { title: 'Планеты: да или нет', type: 'truefalse' },
      { title: 'Планеты: пары', type: 'matching' },
    ])
  })

  it('метасимволы LIKE в q не работают как шаблон', async () => {
    const author = await createTeacher(prisma)
    await seedPublic(author.id, 'Реки')

    const { quizzes } = libraryListResponseSchema.parse(await (await request('GET', '/api/library?q=%25%25')).json())

    expect(quizzes).toEqual([])
  })
})
