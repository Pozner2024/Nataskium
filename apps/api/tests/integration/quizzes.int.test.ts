import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteTeacherRows } from '../../src/features/auth/infrastructure/teacherRepository'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

let prisma: PrismaClient

function quizData(teacherId: string, deletedAt: Date | null = null) {
  return { teacherId, title: 'Столицы', shareToken: randomUUID(), questions: [], deletedAt }
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

describe('викторины учителя', () => {
  it('удаление аккаунта удаляет все викторины учителя, включая помеченные deletedAt, и не трогает чужие', async () => {
    const teacher = await createTeacher(prisma)
    const other = await createTeacher(prisma)
    await prisma.quiz.create({ data: quizData(teacher.id) })
    await prisma.quiz.create({ data: quizData(teacher.id, new Date()) })
    await prisma.quiz.create({ data: quizData(other.id) })

    await prisma.$transaction((tx) => deleteTeacherRows(tx, teacher.id, teacher.email))

    expect(await prisma.quiz.count({ where: { teacherId: teacher.id } })).toBe(0)
    expect(await prisma.quiz.count({ where: { teacherId: other.id } })).toBe(1)
  })

  it('значения по умолчанию: ответы показываются, шкалы нет', async () => {
    const teacher = await createTeacher(prisma)

    const quiz = await prisma.quiz.create({ data: quizData(teacher.id) })

    expect(quiz.showAnswers).toBe(true)
    expect(quiz.gradingScale).toBeNull()
  })

  it('CHECK: шкала только ten/five/letter, title и share_token не пустые', async () => {
    const teacher = await createTeacher(prisma)

    await expect(prisma.quiz.create({ data: { ...quizData(teacher.id), gradingScale: 'bad' } })).rejects.toThrow()
    await expect(prisma.quiz.create({ data: { ...quizData(teacher.id), title: '' } })).rejects.toThrow()
    await expect(prisma.quiz.create({ data: { ...quizData(teacher.id), shareToken: '' } })).rejects.toThrow()
    await expect(prisma.quiz.create({ data: { ...quizData(teacher.id), gradingScale: 'five' } })).resolves.toBeDefined()
  })
})
