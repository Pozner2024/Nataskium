import { randomBytes, randomUUID } from 'node:crypto'
import {
  MAX_QUIZZES_PER_TEACHER,
  type QuizInput,
  quizListResponseSchema,
  quizResponseSchema,
} from '@nataskium/shared/schemas'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeQuizRepository } from '../../src/features/quizzes'
import { makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import type { ImageStorage } from '../../src/shared/infrastructure'
import { MEMORY_IMAGES_BASE_URL, makeMemoryImageStorage } from '../fakes/memoryImageStorage'
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
  group: 'other',
  timer: { mode: 'none' },
  introTheme: 'nataskium-night',
  questions: [
    {
      text: 'Столица Франции?',
      imageId: null,
      options: [
        { text: 'Париж', isCorrect: true, imageId: null },
        { text: 'Рим', isCorrect: false, imageId: null },
      ],
    },
  ],
}

let prisma: PrismaClient
// null — хранилище не настроено, как в тестах шага 1; тесты картинок подставляют memory-хранилище
let imageStorage: ImageStorage | null = null
const app = () => createTestApp({ prisma, imageStorage })

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
  imageStorage = null
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
      { id: quiz.id, type: 'quiz', title: 'Столицы', questionCount: 1, gradingScale: 'five', shareToken: quiz.shareToken, introTheme: 'nataskium-night', thumbnail: { type: 'quiz', text: 'Столица Франции?', imageUrl: null, options: [{ text: 'Париж' }, { text: 'Рим' }] } },
    ])
    const got = quizResponseSchema.parse(await (await call('GET', `/${quiz.id}`, headers)).json())
    expect(got.quiz).toEqual(quiz)
  })

  it('таймер: limit сохраняется и читается; смена на не-limit обнуляет секунды в базе', async () => {
    const teacher = await createTeacher(prisma)
    const headers = await auth(teacher.id)
    const quiz = await createQuiz(headers, { ...INPUT, timer: { mode: 'limit', seconds: 900 } })
    expect(quiz.timer).toEqual({ mode: 'limit', seconds: 900 })
    expect(quizResponseSchema.parse(await (await call('GET', `/${quiz.id}`, headers)).json()).quiz.timer).toEqual(quiz.timer)
    expect(await prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id } })).toMatchObject({ timerMode: 'limit', timeLimitSeconds: 900 })

    const response = await call('PATCH', `/${quiz.id}`, headers, { ...INPUT, timer: { mode: 'stopwatch' } })
    expect(quizResponseSchema.parse(await response.json()).quiz.timer).toEqual({ mode: 'stopwatch' })
    expect(await prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id } })).toMatchObject({ timerMode: 'stopwatch', timeLimitSeconds: null })
  })

  it('тело без поля timer сохраняется как «без таймера»; неверный timer — 400', async () => {
    const teacher = await createTeacher(prisma)
    const headers = await auth(teacher.id)
    const withoutTimer: Partial<QuizInput> = { ...INPUT }
    delete withoutTimer.timer
    const response = await call('POST', '/', headers, withoutTimer)
    expect(response.status).toBe(201)
    expect(quizResponseSchema.parse(await response.json()).quiz.timer).toEqual({ mode: 'none' })
    for (const timer of [{ mode: 'limit' }, { mode: 'limit', seconds: 30 }, { mode: 'none', seconds: 600 }, { mode: 'foo' }]) {
      expect((await call('POST', '/', headers, { ...INPUT, timer })).status).toBe(400)
    }
  })

  it('визуальный стиль: сохраняется в базе и меняется PATCH; без поля — стиль по умолчанию; неизвестный — 400', async () => {
    const teacher = await createTeacher(prisma)
    const headers = await auth(teacher.id)
    const quiz = await createQuiz(headers, { ...INPUT, introTheme: 'nataskium-day' })
    expect(quiz.introTheme).toBe('nataskium-day')
    expect(quizResponseSchema.parse(await (await call('GET', `/${quiz.id}`, headers)).json()).quiz.introTheme).toBe('nataskium-day')
    expect(await prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id } })).toMatchObject({ introTheme: 'nataskium-day' })

    const patched = await call('PATCH', `/${quiz.id}`, headers, { ...INPUT, introTheme: 'nataskium-night' })
    expect(quizResponseSchema.parse(await patched.json()).quiz.introTheme).toBe('nataskium-night')

    const withoutTheme: Partial<QuizInput> = { ...INPUT }
    delete withoutTheme.introTheme
    const response = await call('POST', '/', headers, withoutTheme)
    expect(response.status).toBe(201)
    expect(quizResponseSchema.parse(await response.json()).quiz.introTheme).toBe('nataskium-night')
    const before = await prisma.quiz.count()
    for (const introTheme of ['neon', 'Nataskium-Day', '', null]) {
      expect((await call('POST', '/', headers, { ...INPUT, introTheme })).status).toBe(400)
    }
    expect(await prisma.quiz.count()).toBe(before)
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
      imageId: null,
      options: Array.from({ length: MAX_OPTIONS }, (_, i) => ({ text: HIEROGLYPH.repeat(MAX_OPTION_TEXT), isCorrect: i === 0, imageId: null })),
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
    if (created === 'referenceMissing') throw new Error('teacher and group exist')
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

const IMAGES_PER_QUESTION = 1 + MAX_OPTIONS
const imageKey = (imageId: string) => `quiz-images/${imageId}.webp`
const imageUrl = (imageId: string) => `${MEMORY_IMAGES_BASE_URL}/${imageKey(imageId)}`

// Строка и файл — как после POST /api/quiz-images, без обработки sharp
async function seedImage(storage: ReturnType<typeof makeMemoryImageStorage>, teacherId: string, quizId: string | null = null) {
  const id = randomUUID()
  await prisma.quizImage.create({ data: { id, teacherId, quizId } })
  await storage.storage.put(imageKey(id), new Uint8Array([1]), 'image/webp')
  return id
}

function withImages(questionImage: string | null, optionImage: string | null = null, title = INPUT.title): QuizInput {
  const [question] = INPUT.questions
  const [first, second] = question!.options
  return {
    ...INPUT,
    title,
    questions: [{ ...question!, imageId: questionImage, options: [{ ...first!, imageId: optionImage }, second!] }],
  }
}

async function errorMessage(response: Response): Promise<string> {
  return ((await response.json()) as { error: string }).error
}

async function imageRow(id: string) {
  return prisma.quizImage.findUnique({ where: { id }, select: { quizId: true } })
}

describe('/api/quizzes: картинки', () => {
  let storage: ReturnType<typeof makeMemoryImageStorage>
  let teacherId: string
  let headers: Record<string, string>

  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    storage = makeMemoryImageStorage()
    imageStorage = storage.storage
    teacherId = (await createTeacher(prisma)).id
    headers = await auth(teacherId)
  })

  it('создание со своими картинками — 201, адреса строит сервер, картинки привязаны', async () => {
    const questionImage = await seedImage(storage, teacherId)
    const optionImage = await seedImage(storage, teacherId)
    const response = await call('POST', '/', headers, withImages(questionImage, optionImage))
    expect(response.status).toBe(201)
    const { quiz } = quizResponseSchema.parse(await response.json())

    const question = quiz.questions[0]!
    expect(question).toMatchObject({ imageId: questionImage, imageUrl: imageUrl(questionImage) })
    expect(question.options[0]).toMatchObject({ imageId: optionImage, imageUrl: imageUrl(optionImage) })
    expect(question.options[1]).toMatchObject({ imageId: null, imageUrl: null })
    expect(await imageRow(questionImage)).toEqual({ quizId: quiz.id })
    expect(await imageRow(optionImage)).toEqual({ quizId: quiz.id })

    const got = quizResponseSchema.parse(await (await call('GET', `/${quiz.id}`, headers)).json())
    expect(got.quiz).toEqual(quiz)
  })

  it('чужая или выдуманная картинка — 400 Unknown image, викторина не создана, чужая картинка не привязана', async () => {
    const otherTeacher = (await createTeacher(prisma)).id
    const foreign = await seedImage(storage, otherTeacher)

    for (const imageId of [foreign, randomUUID()]) {
      const response = await call('POST', '/', headers, withImages(imageId))
      expect(response.status).toBe(400)
      expect(await errorMessage(response)).toBe('Unknown image')
    }
    expect(await prisma.quiz.count()).toBe(0)
    expect(await imageRow(foreign)).toEqual({ quizId: null })
  })

  it('картинка викторины A в викторине B — 400; B не изменилась, картинка осталась у A', async () => {
    const image = await seedImage(storage, teacherId)
    const a = await createQuiz(headers, withImages(image))
    const b = await createQuiz(headers, withImages(null, null, 'Викторина Б'))

    const created = await call('POST', '/', headers, withImages(image))
    expect(created.status).toBe(400)
    expect(await errorMessage(created)).toBe('Unknown image')

    const patched = await call('PATCH', `/${b.id}`, headers, withImages(image, null, 'Новое'))
    expect(patched.status).toBe(400)
    expect(await errorMessage(patched)).toBe('Unknown image')

    const got = quizResponseSchema.parse(await (await call('GET', `/${b.id}`, headers)).json()).quiz
    expect(got.title).toBe('Викторина Б')
    expect(got.questions[0]?.imageId).toBeNull()
    expect(await imageRow(image)).toEqual({ quizId: a.id })
    expect(await prisma.quiz.count()).toBe(2)
  })

  it('PATCH чужой викторины со своей картинкой — 404, картинка не привязана', async () => {
    const owner = await auth((await createTeacher(prisma)).id)
    const quiz = await createQuiz(owner)
    const image = await seedImage(storage, teacherId)
    expect((await call('PATCH', `/${quiz.id}`, headers, withImages(image))).status).toBe(404)
    expect(await imageRow(image)).toEqual({ quizId: null })
  })

  it('одна картинка в двух местах — 400', async () => {
    const image = await seedImage(storage, teacherId)
    const response = await call('POST', '/', headers, withImages(image, image))
    expect(response.status).toBe(400)
    expect(await errorMessage(response)).toBe('Image is used more than once')
    expect(await imageRow(image)).toEqual({ quizId: null })
  })

  it('замена картинки: старый файл удалён только после успешного PATCH; при 400 — ничего не изменилось', async () => {
    const first = await seedImage(storage, teacherId)
    const second = await seedImage(storage, teacherId)
    const third = await seedImage(storage, teacherId)
    const quiz = await createQuiz(headers, withImages(first))

    const replaced = await call('PATCH', `/${quiz.id}`, headers, withImages(second))
    expect(replaced.status).toBe(200)
    expect(quizResponseSchema.parse(await replaced.json()).quiz.questions[0]?.imageUrl).toBe(imageUrl(second))
    expect(storage.objects.has(imageKey(first))).toBe(false)
    expect(await imageRow(first)).toBeNull()
    expect(await imageRow(second)).toEqual({ quizId: quiz.id })

    // третья своя и свободная, но рядом выдуманная: откатывается и привязка третьей, и отвязка второй
    const rejected = await call('PATCH', `/${quiz.id}`, headers, withImages(third, randomUUID()))
    expect(rejected.status).toBe(400)
    expect(storage.objects.has(imageKey(second))).toBe(true)
    expect(await imageRow(second)).toEqual({ quizId: quiz.id })
    expect(await imageRow(third)).toEqual({ quizId: null })
    const got = quizResponseSchema.parse(await (await call('GET', `/${quiz.id}`, headers)).json()).quiz
    expect(got.questions[0]?.imageId).toBe(second)
  })

  it('убрать картинку: файл и строка удалены', async () => {
    const image = await seedImage(storage, teacherId)
    const quiz = await createQuiz(headers, withImages(image))
    expect((await call('PATCH', `/${quiz.id}`, headers, INPUT)).status).toBe(200)
    expect(storage.objects.size).toBe(0)
    expect(await imageRow(image)).toBeNull()
  })

  it('сбой удаления файла не валит PATCH: ответ 200, строка удалена, файл остался для сверки хранилища', async () => {
    const image = await seedImage(storage, teacherId)
    const quiz = await createQuiz(headers, withImages(image))
    vi.spyOn(storage.storage, 'remove').mockRejectedValueOnce(new Error('storage is down'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect((await call('PATCH', `/${quiz.id}`, headers, INPUT)).status).toBe(200)
    expect(await imageRow(image)).toBeNull()
    expect(storage.objects.has(imageKey(image))).toBe(true)
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(image)
  })

  it('картинку снова привязали между коммитом и удалением — её строка и файл на месте', async () => {
    const reattached = await seedImage(storage, teacherId)
    const dropped = await seedImage(storage, teacherId)
    const quiz = await createQuiz(headers, withImages(reattached, dropped))
    const other = await createQuiz(headers, withImages(null, null, 'Другая'))
    const transaction = prisma.$transaction.bind(prisma)
    // Вторая вкладка привязывает отвязанную картинку к другой викторине сразу после коммита PATCH
    vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (...args: Parameters<typeof prisma.$transaction>) => {
      const result = await transaction(...args)
      await prisma.quizImage.update({ where: { id: reattached }, data: { quizId: other.id } })
      return result
    })

    expect((await call('PATCH', `/${quiz.id}`, headers, INPUT)).status).toBe(200)
    expect(await imageRow(reattached)).toEqual({ quizId: other.id })
    expect(storage.objects.has(imageKey(reattached))).toBe(true)
    expect(await imageRow(dropped)).toBeNull()
    expect(storage.objects.has(imageKey(dropped))).toBe(false)
  })

  it('id картинки в верхнем регистре сохраняется в нижнем, викторина открывается', async () => {
    const image = await seedImage(storage, teacherId)
    const response = await call('POST', '/', headers, withImages(image.toUpperCase()))
    expect(response.status).toBe(201)
    const { quiz } = quizResponseSchema.parse(await response.json())
    expect(quiz.questions[0]).toMatchObject({ imageId: image, imageUrl: imageUrl(image) })
    expect((await call('GET', `/${quiz.id}`, headers)).status).toBe(200)
  })

  it('удаление викторины удаляет её картинки (файлы и строки), чужие не трогает', async () => {
    const own = [await seedImage(storage, teacherId), await seedImage(storage, teacherId)]
    const otherTeacher = (await createTeacher(prisma)).id
    const foreign = await seedImage(storage, otherTeacher)
    const free = await seedImage(storage, teacherId)
    const quiz = await createQuiz(headers, withImages(own[0]!, own[1]!))

    expect((await call('DELETE', `/${quiz.id}`, headers)).status).toBe(204)
    for (const id of own) {
      expect(storage.objects.has(imageKey(id))).toBe(false)
      expect(await imageRow(id)).toBeNull()
    }
    expect(storage.objects.has(imageKey(foreign))).toBe(true)
    expect(storage.objects.has(imageKey(free))).toBe(true)
  })

  it('две параллельные викторины с одной свободной картинкой — привязывается только к одной', async () => {
    const image = await seedImage(storage, teacherId)
    const statuses = await Promise.all([call('POST', '/', headers, withImages(image)), call('POST', '/', headers, withImages(image))])
    expect(statuses.map((r) => r.status).sort()).toEqual([201, 400])
    expect(await prisma.quiz.count()).toBe(1)
  })

  it('без хранилища: викторина с картинкой — 503 и не создана; без картинок — 201 с imageUrl null', async () => {
    const image = await seedImage(storage, teacherId)
    imageStorage = null
    expect((await call('POST', '/', headers, withImages(image))).status).toBe(503)
    expect(await prisma.quiz.count()).toBe(0)

    const response = await call('POST', '/', headers, INPUT)
    expect(response.status).toBe(201)
    expect(quizResponseSchema.parse(await response.json()).quiz.questions[0]?.imageUrl).toBeNull()
  })

  it('викторина шага 1 без полей картинок в БД открывается и сохраняется', async () => {
    const stepOneQuestions = [{ text: 'Столица Франции?', options: [{ text: 'Париж', isCorrect: true }, { text: 'Рим', isCorrect: false }] }]
    const row = await prisma.quiz.create({
      data: { teacherId, title: 'Шаг 1', shareToken: 'S'.repeat(22), questions: stepOneQuestions },
    })

    const response = await call('GET', `/${row.id}`, headers)
    expect(response.status).toBe(200)
    const { quiz } = quizResponseSchema.parse(await response.json())
    expect(quiz.questions[0]).toEqual({
      text: 'Столица Франции?',
      imageId: null,
      imageUrl: null,
      options: [
        { text: 'Париж', isCorrect: true, imageId: null, imageUrl: null },
        { text: 'Рим', isCorrect: false, imageId: null, imageUrl: null },
      ],
    })
    expect((await call('GET', '/', headers)).status).toBe(200)
    expect((await call('PATCH', `/${row.id}`, headers, { ...INPUT, title: 'Шаг 2' })).status).toBe(200)
  })

  it(`максимальная викторина (50 × вопрос 200 + 6 × 60 «我») и ${IMAGES_PER_QUESTION} картинок на вопрос укладывается в лимит тела — 201`, async () => {
    const ids = Array.from({ length: MAX_QUESTIONS * IMAGES_PER_QUESTION }, () => randomUUID())
    await prisma.quizImage.createMany({ data: ids.map((id) => ({ id, teacherId })) })
    const questions = Array.from({ length: MAX_QUESTIONS }, (_, q) => ({
      text: HIEROGLYPH.repeat(MAX_QUESTION_TEXT),
      imageId: ids[q * IMAGES_PER_QUESTION]!,
      options: Array.from({ length: MAX_OPTIONS }, (_, i) => ({
        text: HIEROGLYPH.repeat(MAX_OPTION_TEXT),
        isCorrect: i === 0,
        imageId: ids[q * IMAGES_PER_QUESTION + 1 + i]!,
      })),
    }))
    const response = await call('POST', '/', headers, { ...INPUT, questions })
    expect(response.status).toBe(201)
    const { quiz } = quizResponseSchema.parse(await response.json())
    expect(quiz.questions).toHaveLength(MAX_QUESTIONS)
    expect(await prisma.quizImage.count({ where: { quizId: quiz.id } })).toBe(ids.length)
  })
})

// Аккаунт удалён, access-токен ещё действует (до 15 минут): вставка упирается во внешний ключ teacher_id
describe('/api/quizzes: учителя уже нет', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('создание — 401 как у requireAuth (WWW-Authenticate: Bearer), без записи в лог; викторины нет', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unauthenticated = await call('POST', '/', {}, INPUT)

    const response = await call('POST', '/', await auth(randomUUID()), INPUT)

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(await response.json()).toEqual(await unauthenticated.json())
    expect(errorLog).not.toHaveBeenCalled()
    expect(await prisma.quiz.count()).toBe(0)
  })

  it('группу удалили между проверкой и вставкой — 400 Unknown group, а не 401', async () => {
    const headers = await auth((await createTeacher(prisma)).id)
    // Первая проверка группы (до вставки) «находит» несуществующую группу; повторная после сбоя — настоящая
    vi.spyOn(prisma.libraryGroup, 'count').mockResolvedValueOnce(1)

    const response = await call('POST', '/', headers, { ...INPUT, group: 'ghost-group' })

    expect(response.status).toBe(400)
    expect(await errorMessage(response)).toBe('Unknown group')
    expect(await prisma.quiz.count()).toBe(0)
  })
})

describe('GET /api/quizzes: список без разбора вопросов', () => {
  const SUMMARY_KEYS = ['gradingScale', 'id', 'introTheme', 'questionCount', 'shareToken', 'thumbnail', 'title', 'type']

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function seedRow(teacherId: string, title: string, options: { questions?: object; createdAt?: Date; deletedAt?: Date } = {}) {
    return prisma.quiz.create({
      data: {
        teacherId,
        title,
        shareToken: randomBytes(16).toString('base64url'),
        questions: options.questions ?? INPUT.questions,
        createdAt: options.createdAt,
        deletedAt: options.deletedAt,
      },
    })
  }

  it('поля элемента — ровно контракт; количество вопросов считает база; новые сверху; удалённые и чужие не видны', async () => {
    const teacher = await createTeacher(prisma)
    const other = await createTeacher(prisma)
    const older = await seedRow(teacher.id, 'Старая', { createdAt: new Date(Date.now() - 60_000) })
    const newer = await seedRow(teacher.id, 'Новая', { questions: [...INPUT.questions, ...INPUT.questions, ...INPUT.questions] })
    await seedRow(teacher.id, 'Удалённая', { deletedAt: new Date() })
    await seedRow(other.id, 'Чужая')

    const body = (await (await call('GET', '/', await auth(teacher.id))).json()) as { quizzes: Record<string, unknown>[] }

    for (const item of body.quizzes) expect(Object.keys(item).sort()).toEqual(SUMMARY_KEYS)
    expect(quizListResponseSchema.parse(body).quizzes).toEqual([
      { id: newer.id, type: 'quiz', title: 'Новая', questionCount: 3, gradingScale: null, shareToken: newer.shareToken, introTheme: 'nataskium-night', thumbnail: { type: 'quiz', text: 'Столица Франции?', imageUrl: null, options: [{ text: 'Париж' }, { text: 'Рим' }] } },
      { id: older.id, type: 'quiz', title: 'Старая', questionCount: 1, gradingScale: null, shareToken: older.shareToken, introTheme: 'nataskium-night', thumbnail: { type: 'quiz', text: 'Столица Франции?', imageUrl: null, options: [{ text: 'Париж' }, { text: 'Рим' }] } },
    ])
  })

  it('вопросы, не проходящие схему, не ломают список', async () => {
    const teacher = await createTeacher(prisma)
    const headers = await auth(teacher.id)
    const broken = await seedRow(teacher.id, 'Битая', { questions: [{ broken: true }, { broken: true }] })

    const response = await call('GET', '/', headers)

    expect(response.status).toBe(200)
    expect(quizListResponseSchema.parse(await response.json()).quizzes).toMatchObject([{ id: broken.id, questionCount: 2 }])
  })

  it('questions не массив — рассинхрон данных: 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const teacher = await createTeacher(prisma)
    await seedRow(teacher.id, 'Не массив', { questions: { broken: true } })

    expect((await call('GET', '/', await auth(teacher.id))).status).toBe(500)
  })
})
