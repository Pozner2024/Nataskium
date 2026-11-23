import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTeacherRepository } from '../../src/features/auth'
import type { TeacherRepository } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { ARGON2ID_HASH, days, fromNow, newTokenHash } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const EMAIL = 'qa-anna@example.test'
const ACCOUNT_FIELDS = ['displayName', 'email', 'emailVerifiedAt', 'googleId', 'id', 'passwordHash']

let prisma: PrismaClient
let repository: TeacherRepository
let teacherId: string

beforeAll(async () => {
  prisma = await createTestPrisma()
  repository = makeTeacherRepository(prisma)
})

beforeEach(async () => {
  await truncateAll(prisma)
  const teacher = await prisma.teacher.create({ data: { email: EMAIL, passwordHash: ARGON2ID_HASH, displayName: 'Анна' } })
  teacherId = teacher.id
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('teacherRepository', () => {
  it('findByEmail находит учителя и отдаёт только поля аккаунта', async () => {
    const account = await repository.findByEmail(EMAIL)

    expect(Object.keys(account ?? {}).sort()).toEqual(ACCOUNT_FIELDS)
    expect(account).toMatchObject({ id: teacherId, email: EMAIL, displayName: 'Анна', passwordHash: ARGON2ID_HASH })
  })

  it('findById находит того же учителя', async () => {
    expect(await repository.findById(teacherId)).toEqual(await repository.findByEmail(EMAIL))
  })

  // Нормализация email — в Zod до репозитория: здесь сравнение точное
  it.each(['QA-Anna@example.test', ` ${EMAIL}`, 'qa-boris@example.test'])('findByEmail(%j) → null', async (email) => {
    expect(await repository.findByEmail(email)).toBeNull()
  })

  it('findById неизвестного id → null', async () => {
    expect(await repository.findById(randomUUID())).toBeNull()
  })
})

describe('teacherRepository.deleteAccount со сверенным хэшем', () => {
  it('пароль сбросили после сверки — false, учитель и его токены на месте', async () => {
    const resetHash = '$argon2id$v=19$m=19456,t=2,p=1$cmVzZXQ$cmVzZXRoYXNo'
    await prisma.teacher.update({ where: { id: teacherId }, data: { passwordHash: resetHash } })
    await prisma.refreshToken.create({
      data: { teacherId, familyId: randomUUID(), familyExpiresAt: fromNow(days(30)), tokenHash: newTokenHash(), expiresAt: fromNow(days(14)) },
    })

    expect(await repository.deleteAccount(teacherId, EMAIL, ARGON2ID_HASH)).toBe(false)
    expect(await prisma.teacher.count({ where: { id: teacherId } })).toBe(1)
    expect(await prisma.refreshToken.count({ where: { teacherId } })).toBe(1)
  })

  it('сверенный хэш ещё текущий — учитель удалён', async () => {
    expect(await repository.deleteAccount(teacherId, EMAIL, ARGON2ID_HASH)).toBe(true)
    expect(await prisma.teacher.count({ where: { id: teacherId } })).toBe(0)
  })
})

describe('teacherRepository.changePassword', () => {
  const NEW_HASH = '$argon2id$v=19$m=19456,t=2,p=1$bmV3$bmV3aGFzaA'
  const RESET_HASH = '$argon2id$v=19$m=19456,t=2,p=1$cmVzZXQ$cmVzZXRoYXNo'

  async function createRefreshToken() {
    await prisma.refreshToken.create({
      data: { teacherId, familyId: randomUUID(), familyExpiresAt: fromNow(days(30)), tokenHash: newTokenHash(), expiresAt: fromNow(days(14)) },
    })
  }

  it('сверенный хэш ещё текущий — пароль меняется, refresh-токены удаляются', async () => {
    await createRefreshToken()

    expect(await repository.changePassword(teacherId, ARGON2ID_HASH, NEW_HASH)).toBe(true)
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: teacherId } })).passwordHash).toBe(NEW_HASH)
    expect(await prisma.refreshToken.count({ where: { teacherId } })).toBe(0)
  })

  it('пароль сбросили после сверки — false, хэш из сброса и токены не тронуты', async () => {
    await prisma.teacher.update({ where: { id: teacherId }, data: { passwordHash: RESET_HASH } })
    await createRefreshToken()

    expect(await repository.changePassword(teacherId, ARGON2ID_HASH, NEW_HASH)).toBe(false)
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: teacherId } })).passwordHash).toBe(RESET_HASH)
    expect(await prisma.refreshToken.count({ where: { teacherId } })).toBe(1)
  })
})
