import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTeacherRepository } from '../../src/features/auth'
import type { TeacherRepository } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { ARGON2ID_HASH } from './authFixtures'
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
