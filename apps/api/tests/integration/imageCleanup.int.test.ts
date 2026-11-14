import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createImageCleanup } from '../../src/app'
import { deleteTeacherRows } from '../../src/features/auth/infrastructure/teacherRepository'
import { quizImageKey } from '../../src/features/quiz-images'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { makeMemoryImageStorage } from '../fakes/memoryImageStorage'
import { createTeacher, fromNow, hours } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const SHARE_TOKEN_BYTES = 16
const BODY = new Uint8Array([1, 2, 3])
const RECONCILE = { reconcileStorage: true }

let prisma: PrismaClient
let memory: ReturnType<typeof makeMemoryImageStorage>

async function createQuiz(teacherId: string) {
  return prisma.quiz.create({
    data: { teacherId, title: 'Q', shareToken: randomBytes(SHARE_TOKEN_BYTES).toString('base64url'), questions: [] },
  })
}

// Как загрузка: файл, затем строка; возраст файла и строки одинаковый
async function createImage(teacherId: string, options: { quizId?: string; ageMs: number }): Promise<string> {
  const id = randomUUID()
  const key = quizImageKey(id)
  await memory.storage.put(key, BODY, 'image/webp')
  memory.modifiedAt.set(key, fromNow(-options.ageMs))
  await prisma.quizImage.create({ data: { id, teacherId, quizId: options.quizId ?? null, createdAt: fromNow(-options.ageMs) } })
  return id
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
  memory = makeMemoryImageStorage()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('createImageCleanup на настоящей базе', () => {
  it('удаление аккаунта учителя + очистка → в хранилище нет его файлов, чужие на месте', async () => {
    const teacher = await createTeacher(prisma)
    const other = await createTeacher(prisma)
    const quiz = await createQuiz(teacher.id)
    const otherQuiz = await createQuiz(other.id)
    const attached = await createImage(teacher.id, { quizId: quiz.id, ageMs: hours(48) })
    const detached = await createImage(teacher.id, { ageMs: hours(25) })
    const otherAttached = await createImage(other.id, { quizId: otherQuiz.id, ageMs: hours(48) })

    await prisma.$transaction((tx) => deleteTeacherRows(tx, teacher.id, teacher.email))
    await createImageCleanup(prisma, memory.storage, RECONCILE)()

    expect(memory.objects.has(quizImageKey(attached))).toBe(false)
    expect(memory.objects.has(quizImageKey(detached))).toBe(false)
    expect(memory.objects.has(quizImageKey(otherAttached))).toBe(true)
    expect(await prisma.quizImage.count({ where: { id: otherAttached } })).toBe(1)
  })

  it('неприкреплённая 25 ч назад — удалены строка и файл; 1 ч назад и прикреплённая — на месте', async () => {
    const teacher = await createTeacher(prisma)
    const quiz = await createQuiz(teacher.id)
    const old = await createImage(teacher.id, { ageMs: hours(25) })
    const fresh = await createImage(teacher.id, { ageMs: hours(1) })
    const attached = await createImage(teacher.id, { quizId: quiz.id, ageMs: hours(48) })

    await createImageCleanup(prisma, memory.storage, RECONCILE)()

    expect(await prisma.quizImage.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).toEqual(
      [{ id: fresh }, { id: attached }].sort((a, b) => a.id.localeCompare(b.id)),
    )
    expect(memory.objects.has(quizImageKey(old))).toBe(false)
    expect(memory.objects.has(quizImageKey(fresh))).toBe(true)
    expect(memory.objects.has(quizImageKey(attached))).toBe(true)
  })

  it('файл без строки: старше 24 ч удаляется, свежий (идёт загрузка) остаётся', async () => {
    const teacher = await createTeacher(prisma)
    const quiz = await createQuiz(teacher.id)
    await createImage(teacher.id, { quizId: quiz.id, ageMs: hours(48) })
    const staleKey = quizImageKey(randomUUID())
    const uploadingKey = quizImageKey(randomUUID())
    await memory.storage.put(staleKey, BODY, 'image/webp')
    memory.modifiedAt.set(staleKey, fromNow(-hours(25)))
    await memory.storage.put(uploadingKey, BODY, 'image/webp')

    await createImageCleanup(prisma, memory.storage, RECONCILE)()

    expect(memory.objects.has(staleKey)).toBe(false)
    expect(memory.objects.has(uploadingKey)).toBe(true)
  })

  it('без хранилища удаляет только старые неприкреплённые строки', async () => {
    const teacher = await createTeacher(prisma)
    const old = randomUUID()
    const fresh = randomUUID()
    await prisma.quizImage.create({ data: { id: old, teacherId: teacher.id, createdAt: fromNow(-hours(25)) } })
    await prisma.quizImage.create({ data: { id: fresh, teacherId: teacher.id } })

    await createImageCleanup(prisma, null, RECONCILE)()

    expect(await prisma.quizImage.findMany({ select: { id: true } })).toEqual([{ id: fresh }])
  })

  it('сверка выключена: файл без строки остаётся, осиротевшая строка и её файл удаляются', async () => {
    const teacher = await createTeacher(prisma)
    const orphan = await createImage(teacher.id, { ageMs: hours(25) })
    const strayKey = quizImageKey(randomUUID())
    await memory.storage.put(strayKey, BODY, 'image/webp')
    memory.modifiedAt.set(strayKey, fromNow(-hours(25)))

    await createImageCleanup(prisma, memory.storage, { reconcileStorage: false })()

    expect(memory.objects.has(strayKey)).toBe(true)
    expect(memory.objects.has(quizImageKey(orphan))).toBe(false)
    expect(await prisma.quizImage.count()).toBe(0)
  })

  it('предохранитель: пустая quiz_images — сверка не удаляет ни одного файла', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const strayKey = quizImageKey(randomUUID())
    await memory.storage.put(strayKey, BODY, 'image/webp')
    memory.modifiedAt.set(strayKey, fromNow(-hours(25)))

    await createImageCleanup(prisma, memory.storage, RECONCILE)()

    expect(memory.objects.has(strayKey)).toBe(true)
  })
})
