import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTeacherRepository } from '../../src/features/auth'
import type { TeacherRepository } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { ARGON2ID_HASH, createTeacher, days, fromNow, newTokenHash } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const EMAIL = 'qa-anna@example.test'
const GOOGLE_ID = 'google-sub-anna'
const OTHER_GOOGLE_ID = 'google-sub-impostor'
const PARALLEL_ATTEMPTS = 10

let prisma: PrismaClient
let repository: TeacherRepository

function profile(overrides: { googleId?: string; email?: string; displayName?: string | null } = {}) {
  return { googleId: overrides.googleId ?? GOOGLE_ID, email: overrides.email ?? EMAIL, displayName: overrides.displayName ?? 'Анна' }
}

async function pendingFor(email: string) {
  await prisma.pendingRegistration.create({
    data: { email, passwordHash: `${ARGON2ID_HASH}-attacker`, tokenHash: newTokenHash(), expiresAt: fromNow(days(1)) },
  })
}

beforeAll(async () => {
  prisma = await createTestPrisma()
  repository = makeTeacherRepository(prisma)
})

beforeEach(async () => {
  await truncateAll(prisma)
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('signInWithGoogle', () => {
  it('новый учитель: создаётся без пароля, с googleId, именем и временем подтверждения', async () => {
    const now = new Date('2026-11-06T12:00:00Z')

    const result = await repository.signInWithGoogle(profile(), now)

    expect(result).toEqual({ status: 'signedIn', teacher: expect.objectContaining({ email: EMAIL, googleId: GOOGLE_ID }) })
    const row = await prisma.teacher.findUnique({ where: { email: EMAIL } })
    expect(row).toMatchObject({ passwordHash: null, googleId: GOOGLE_ID, displayName: 'Анна', emailVerifiedAt: now })
  })

  it('повторный вход тем же googleId: signedIn, данные учителя не меняются', async () => {
    await repository.signInWithGoogle(profile(), new Date())
    const before = await prisma.teacher.findUnique({ where: { email: EMAIL } })

    const result = await repository.signInWithGoogle(profile({ email: 'qa-changed@example.test', displayName: 'Другое имя' }), new Date())

    expect(result).toMatchObject({ status: 'signedIn', teacher: { id: before?.id, email: EMAIL } })
    expect(await prisma.teacher.findUnique({ where: { id: before?.id } })).toEqual(before)
    expect(await prisma.teacher.count()).toBe(1)
  })

  // Google подтвердил адрес, но не то, что аккаунт Google принадлежит этому учителю: привязка — только после пароля
  it('учитель с паролем и тем же email: passwordRequired, учитель не меняется', async () => {
    const existing = await prisma.teacher.create({
      data: { email: EMAIL, passwordHash: ARGON2ID_HASH, displayName: 'Анна Ли', emailVerifiedAt: new Date() },
    })

    const result = await repository.signInWithGoogle(profile({ displayName: 'Имя из Google' }), new Date())

    expect(result).toEqual({ status: 'passwordRequired', teacherId: existing.id })
    expect(await prisma.teacher.findUnique({ where: { id: existing.id } })).toEqual(existing)
  })

  it('после привязки (googleId записан) вход сразу — signedIn', async () => {
    const existing = await createTeacher(prisma, EMAIL)
    await prisma.teacher.update({ where: { id: existing.id }, data: { googleId: GOOGLE_ID } })

    expect(await repository.signInWithGoogle(profile(), new Date())).toMatchObject({ status: 'signedIn', teacher: { id: existing.id } })
  })

  it('у учителя с этим email другой Google-аккаунт — conflict, ничего не меняется', async () => {
    await repository.signInWithGoogle(profile(), new Date())

    expect(await repository.signInWithGoogle(profile({ googleId: OTHER_GOOGLE_ID }), new Date())).toEqual({ status: 'conflict' })
    expect((await prisma.teacher.findUnique({ where: { email: EMAIL } }))?.googleId).toBe(GOOGLE_ID)
    expect(await prisma.teacher.count()).toBe(1)
  })

  it.each([
    ['при создании нового учителя', false],
    ['при привязке к учителю с паролем', true],
  ])('незавершённые регистрации этого email удаляются %s: пароль постороннего не активируется', async (_name, withTeacher) => {
    if (withTeacher) await createTeacher(prisma, EMAIL)
    await pendingFor(EMAIL)
    await pendingFor('qa-other@example.test')

    await repository.signInWithGoogle(profile(), new Date())

    expect(await prisma.pendingRegistration.count({ where: { email: EMAIL } })).toBe(0)
    expect(await prisma.pendingRegistration.count()).toBe(1)
  })

  it('гонка: два параллельных первых входа одним Google-аккаунтом — один учитель, оба входят', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      await truncateAll(prisma)

      const results = await Promise.all([repository.signInWithGoogle(profile(), new Date()), repository.signInWithGoogle(profile(), new Date())])

      expect(results.map((result) => result.status)).toEqual(['signedIn', 'signedIn'])
      expect(new Set(results.map((result) => (result.status === 'signedIn' ? result.teacher.id : null))).size).toBe(1)
      expect(await prisma.teacher.count()).toBe(1)
    }
  })

  it('гонка: два параллельных входа к учителю с паролем — оба passwordRequired, Google не привязан', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      await truncateAll(prisma)
      await createTeacher(prisma, EMAIL)

      const results = await Promise.all([repository.signInWithGoogle(profile(), new Date()), repository.signInWithGoogle(profile(), new Date())])

      expect(results.map((result) => result.status)).toEqual(['passwordRequired', 'passwordRequired'])
      expect(await prisma.teacher.findUnique({ where: { email: EMAIL } })).toMatchObject({ passwordHash: ARGON2ID_HASH, googleId: null })
    }
  })

  it('гонка: два разных Google-аккаунта с одним email — один входит, другой conflict', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      await truncateAll(prisma)

      const results = await Promise.all([
        repository.signInWithGoogle(profile(), new Date()),
        repository.signInWithGoogle(profile({ googleId: OTHER_GOOGLE_ID }), new Date()),
      ])

      expect(results.map((result) => result.status).sort()).toEqual(['conflict', 'signedIn'])
      expect(await prisma.teacher.count()).toBe(1)
    }
  })
})
