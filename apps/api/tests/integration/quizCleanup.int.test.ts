import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuizCleanup } from '../../src/app'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { createTeacher, days, fromNow } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const SHARE_TOKEN_BYTES = 16
const QUIZ_TITLE = 'Контрольная по алгебре'

let prisma: PrismaClient

async function createQuiz(teacherId: string, deletedAt: Date | null) {
  return prisma.quiz.create({
    data: {
      teacherId,
      title: QUIZ_TITLE,
      shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
      questions: [],
      createdAt: fromNow(-days(90)),
      deletedAt,
    },
  })
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

describe('createQuizCleanup на настоящей базе', () => {
  it('удалённая больше 30 дней назад — строка удалена; удалённая 29 дней назад и неудалённая старая — на месте', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const teacher = await createTeacher(prisma)
    const expired = await createQuiz(teacher.id, fromNow(-days(31)))
    const recent = await createQuiz(teacher.id, fromNow(-days(29)))
    const alive = await createQuiz(teacher.id, null)

    await createQuizCleanup(prisma)()

    const left = await prisma.quiz.findMany({ select: { id: true } })
    expect(left.map((row) => row.id).sort()).toEqual([recent.id, alive.id].sort())
    expect(left.map((row) => row.id)).not.toContain(expired.id)
    // В логе — только количество, без id и названий
    expect(log.mock.calls).toEqual([['[quiz-cleanup] deleted quizzes purged', { quizzes: 1 }]])
    expect(JSON.stringify(log.mock.calls)).not.toContain(expired.id)
    expect(JSON.stringify(log.mock.calls)).not.toContain(QUIZ_TITLE)
  })

  it('картинка, всё ещё привязанная к удаляемой викторине, остаётся строкой без викторины (её добьёт очистка картинок)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const teacher = await createTeacher(prisma)
    const expired = await createQuiz(teacher.id, fromNow(-days(31)))
    const imageId = randomUUID()
    await prisma.quizImage.create({ data: { id: imageId, teacherId: teacher.id, quizId: expired.id } })

    await createQuizCleanup(prisma)()

    expect(await prisma.quiz.count()).toBe(0)
    expect(await prisma.quizImage.findUnique({ where: { id: imageId }, select: { quizId: true } })).toEqual({ quizId: null })
  })

  it('удалённые викторины других учителей удаляются тем же запуском', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const a = await createTeacher(prisma)
    const b = await createTeacher(prisma)
    await createQuiz(a.id, fromNow(-days(40)))
    await createQuiz(b.id, fromNow(-days(31)))

    await createQuizCleanup(prisma)()

    expect(await prisma.quiz.count()).toBe(0)
  })
})
