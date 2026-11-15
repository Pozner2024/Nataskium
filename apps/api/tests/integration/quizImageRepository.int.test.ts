import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeQuizImageRepository } from '../../src/features/quiz-images'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { createTeacher, days } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const SHARE_TOKEN_BYTES = 16

let prisma: PrismaClient

async function createQuiz(teacherId: string) {
  return prisma.quiz.create({
    data: { teacherId, title: 'Q', shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'), questions: [] },
  })
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

describe('quizImageRepository', () => {
  it('findOwned возвращает только картинки учителя, с привязкой', async () => {
    const images = makeQuizImageRepository(prisma)
    const [owner, other] = [await createTeacher(prisma), await createTeacher(prisma)]
    const quiz = await createQuiz(owner.id)
    const [a, b, foreign] = [randomUUID(), randomUUID(), randomUUID()]
    await images.create(a, owner.id)
    await images.create(b, owner.id)
    await images.create(foreign, other.id)
    await images.attach(quiz.id, owner.id, [b])

    const owned = await images.findOwned([a, b, foreign, randomUUID()], owner.id)

    expect(owned.sort((x, y) => x.id.localeCompare(y.id))).toEqual(
      [{ id: a, quizId: null }, { id: b, quizId: quiz.id }].sort((x, y) => x.id.localeCompare(y.id)),
    )
    expect(await images.findOwned([], owner.id)).toEqual([])
  })

  it('detachMissing отвязывает только картинки этой викторины не из списка и возвращает их id', async () => {
    const images = makeQuizImageRepository(prisma)
    const teacher = await createTeacher(prisma)
    const [quiz, otherQuiz] = [await createQuiz(teacher.id), await createQuiz(teacher.id)]
    const [keep, drop, elsewhere] = [randomUUID(), randomUUID(), randomUUID()]
    for (const id of [keep, drop, elsewhere]) await images.create(id, teacher.id)
    await images.attach(quiz.id, teacher.id, [keep, drop])
    await images.attach(otherQuiz.id, teacher.id, [elsewhere])

    expect(await images.detachMissing(quiz.id, teacher.id, [keep])).toEqual([drop])
    expect(await images.findOwned([keep, drop, elsewhere], teacher.id)).toEqual(
      expect.arrayContaining([
        { id: keep, quizId: quiz.id },
        { id: drop, quizId: null },
        { id: elsewhere, quizId: otherQuiz.id },
      ]),
    )
    expect((await images.detachMissing(otherQuiz.id, teacher.id, [])).sort()).toEqual([elsewhere])
  })

  it('attach: чужая и неизвестная картинка не привязываются, занятая другой викториной не перехватывается', async () => {
    const images = makeQuizImageRepository(prisma)
    const [owner, other] = [await createTeacher(prisma), await createTeacher(prisma)]
    const [quiz, otherQuiz, foreignQuiz] = [await createQuiz(owner.id), await createQuiz(owner.id), await createQuiz(other.id)]
    const [free, taken, foreign] = [randomUUID(), randomUUID(), randomUUID()]
    await images.create(free, owner.id)
    await images.create(taken, owner.id)
    await images.create(foreign, other.id)
    expect(await images.attach(otherQuiz.id, owner.id, [taken])).toBe(1)

    expect(await images.attach(quiz.id, owner.id, [free, taken, foreign, randomUUID()])).toBe(1)
    // Повторная привязка к той же викторине — не ошибка
    expect(await images.attach(quiz.id, owner.id, [free])).toBe(1)
    // Чужой учитель не привязывает картинку владельца даже к своей викторине
    expect(await images.attach(foreignQuiz.id, other.id, [free])).toBe(0)
    expect(await images.attach(quiz.id, owner.id, [])).toBe(0)

    const rows = await prisma.quizImage.findMany({ select: { id: true, quizId: true } })
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: free, quizId: quiz.id },
        { id: taken, quizId: otherQuiz.id },
        { id: foreign, quizId: null },
      ]),
    )
  })

  it('detachMissing не трогает картинки другого учителя', async () => {
    const images = makeQuizImageRepository(prisma)
    const [owner, other] = [await createTeacher(prisma), await createTeacher(prisma)]
    const quiz = await createQuiz(owner.id)
    const mine = randomUUID()
    await images.create(mine, owner.id)
    await images.attach(quiz.id, owner.id, [mine])

    expect(await images.detachMissing(quiz.id, other.id, [])).toEqual([])
    expect(await images.findOwned([mine], owner.id)).toEqual([{ id: mine, quizId: quiz.id }])
  })

  it('listOrphans — без викторины и старше порога; existingIds и deleteRows', async () => {
    const images = makeQuizImageRepository(prisma)
    const teacher = await createTeacher(prisma)
    const quiz = await createQuiz(teacher.id)
    const [old, fresh, attached] = [randomUUID(), randomUUID(), randomUUID()]
    for (const id of [old, fresh, attached]) await images.create(id, teacher.id)
    await images.attach(quiz.id, teacher.id, [attached])
    await prisma.quizImage.updateMany({ where: { id: { in: [old, attached] } }, data: { createdAt: new Date(Date.now() - days(2)) } })

    expect(await images.listOrphans(new Date(Date.now() - days(1)))).toEqual([old])

    await images.deleteRows([old])
    expect((await images.existingIds([old, fresh, attached, randomUUID()])).sort()).toEqual([fresh, attached].sort())
  })

  it('deleteDetached удаляет только непривязанные строки и возвращает их id', async () => {
    const images = makeQuizImageRepository(prisma)
    const teacher = await createTeacher(prisma)
    const quiz = await createQuiz(teacher.id)
    const [free, attached] = [randomUUID(), randomUUID()]
    for (const id of [free, attached]) await images.create(id, teacher.id)
    await images.attach(quiz.id, teacher.id, [attached])

    expect(await images.deleteDetached([free, attached, randomUUID()])).toEqual([free])
    expect(await images.existingIds([free, attached])).toEqual([attached])
    expect(await images.deleteDetached([])).toEqual([])
  })

  it('удаление учителя удаляет его строки, жёсткое удаление викторины отвязывает картинки', async () => {
    const images = makeQuizImageRepository(prisma)
    const [teacher, other] = [await createTeacher(prisma), await createTeacher(prisma)]
    const quiz = await createQuiz(other.id)
    const [mine, theirs] = [randomUUID(), randomUUID()]
    await images.create(mine, teacher.id)
    await images.create(theirs, other.id)
    await images.attach(quiz.id, other.id, [theirs])

    await prisma.teacher.delete({ where: { id: teacher.id } })
    await prisma.quiz.delete({ where: { id: quiz.id } })

    expect(await images.existingIds([mine, theirs])).toEqual([theirs])
    expect(await images.findOwned([theirs], other.id)).toEqual([{ id: theirs, quizId: null }])
  })
})
