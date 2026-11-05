import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makePendingRegistrationRepository } from '../../src/features/auth'
import type { PendingRegistrationRepository } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { ARGON2ID_HASH, createTeacher, days, fromNow, hours, newTokenHash } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const EMAIL = 'qa-anna@example.test'
const OTHER_EMAIL = 'qa-boris@example.test'
const REGISTRATION_TTL_MS = days(1)
const PARALLEL_ATTEMPTS = 30
const VERIFIED_AT_TOLERANCE_MS = 60_000

let prisma: PrismaClient
let repository: PendingRegistrationRepository

async function register(overrides: { email?: string; displayName?: string | null; passwordHash?: string } = {}) {
  const tokenHash = newTokenHash()
  await repository.create({
    email: overrides.email ?? EMAIL,
    passwordHash: overrides.passwordHash ?? `${ARGON2ID_HASH}-${randomUUID()}`,
    displayName: overrides.displayName === undefined ? 'Анна' : overrides.displayName,
    tokenHash,
    expiresAt: fromNow(REGISTRATION_TTL_MS),
  })
  const registration = await repository.findByTokenHash(tokenHash)
  if (registration === null) throw new Error('registration not found')
  return { registration, tokenHash }
}

beforeAll(async () => {
  prisma = await createTestPrisma()
  repository = makePendingRegistrationRepository(prisma)
})

beforeEach(async () => {
  await truncateAll(prisma)
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('create и findByTokenHash', () => {
  it('сохраняет запись и находит её по хэшу токена, без самого хэша', async () => {
    const { registration } = await register()

    expect(Object.keys(registration).sort()).toEqual(['displayName', 'email', 'expiresAt', 'id', 'passwordHash'])
    expect(registration).toMatchObject({ email: EMAIL, displayName: 'Анна' })
  })

  it('неизвестный хэш → null', async () => {
    expect(await repository.findByTokenHash(newTokenHash())).toBeNull()
  })

  it('несколько записей с одним email допустимы', async () => {
    await register()
    await register()

    expect(await prisma.pendingRegistration.count({ where: { email: EMAIL } })).toBe(2)
  })
})

describe('activate', () => {
  it('создаёт учителя с паролем, именем и временем подтверждения этой записи', async () => {
    const { registration, tokenHash } = await register()

    const result = await repository.activate(registration, tokenHash)

    expect(result.status).toBe('activated')
    const teacher = await prisma.teacher.findUnique({ where: { email: EMAIL } })
    expect(teacher).toMatchObject({ passwordHash: registration.passwordHash, displayName: 'Анна', googleId: null })
    expect(Math.abs((teacher?.emailVerifiedAt?.getTime() ?? 0) - Date.now())).toBeLessThan(VERIFIED_AT_TOLERANCE_MS)
    if (result.status === 'activated') expect(result.teacher).toMatchObject({ id: teacher?.id, email: EMAIL })
  })

  it('без имени — displayName null', async () => {
    const { registration, tokenHash } = await register({ displayName: null })

    await repository.activate(registration, tokenHash)

    expect((await prisma.teacher.findUnique({ where: { email: EMAIL } }))?.displayName).toBeNull()
  })

  it('удаляет все записи этого email и не трогает чужие', async () => {
    const { registration, tokenHash } = await register()
    await register()
    await register()
    await register({ email: OTHER_EMAIL })

    await repository.activate(registration, tokenHash)

    expect(await prisma.pendingRegistration.count({ where: { email: EMAIL } })).toBe(0)
    expect(await prisma.pendingRegistration.count({ where: { email: OTHER_EMAIL } })).toBe(1)
  })

  it('пароль берётся из подтверждённой записи, а не из другой записи того же email', async () => {
    await register({ passwordHash: `${ARGON2ID_HASH}-first` })
    const { registration, tokenHash } = await register({ passwordHash: `${ARGON2ID_HASH}-second` })

    await repository.activate(registration, tokenHash)

    expect((await prisma.teacher.findUnique({ where: { email: EMAIL } }))?.passwordHash).toBe(`${ARGON2ID_HASH}-second`)
  })

  it('повторное подтверждение тем же токеном → alreadyUsed', async () => {
    const { registration, tokenHash } = await register()
    await repository.activate(registration, tokenHash)

    expect(await repository.activate(registration, tokenHash)).toEqual({ status: 'alreadyUsed' })
  })

  it('истёкшая запись → alreadyUsed, учитель не создаётся', async () => {
    const tokenHash = newTokenHash()
    const expired = await prisma.pendingRegistration.create({
      data: {
        email: EMAIL,
        passwordHash: ARGON2ID_HASH,
        tokenHash,
        createdAt: fromNow(-hours(2)),
        expiresAt: fromNow(-hours(1)),
      },
    })

    expect(await repository.activate({ ...expired, displayName: null }, tokenHash)).toEqual({ status: 'alreadyUsed' })
    expect(await prisma.teacher.count()).toBe(0)
  })

  it('чужой токен (запись одна, хэш от другой) → alreadyUsed, обе записи на месте', async () => {
    const own = await register()
    const foreign = await register({ email: OTHER_EMAIL })

    expect(await repository.activate(own.registration, foreign.tokenHash)).toEqual({ status: 'alreadyUsed' })
    expect(await prisma.pendingRegistration.count()).toBe(2)
    expect(await prisma.teacher.count()).toBe(0)
  })

  it('учитель с этим email уже есть → emailTaken, его данные не меняются', async () => {
    const existing = await createTeacher(prisma, EMAIL)
    const { registration, tokenHash } = await register()

    expect(await repository.activate(registration, tokenHash)).toEqual({ status: 'emailTaken' })
    expect(await prisma.teacher.findUnique({ where: { email: EMAIL } })).toEqual(existing)
  })

  it('два параллельных подтверждения разных записей одного email: одно activated, другое без учителя и без ошибки', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      await truncateAll(prisma)
      const first = await register()
      const second = await register()

      const results = await Promise.allSettled([
        repository.activate(first.registration, first.tokenHash),
        repository.activate(second.registration, second.tokenHash),
      ])

      const statuses = results.map((result) => (result.status === 'fulfilled' ? result.value.status : `error: ${String(result.reason).slice(0, 120)}`))
      expect(statuses.filter((status) => status === 'activated'), statuses.join(' | ')).toHaveLength(1)
      expect(statuses.filter((status) => status !== 'activated')[0]).toMatch(/^(emailTaken|alreadyUsed)$/)
      expect(await prisma.teacher.count({ where: { email: EMAIL } })).toBe(1)
    }
  })

  it('два параллельных подтверждения одним токеном: одно activated, другое alreadyUsed', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      await truncateAll(prisma)
      const { registration, tokenHash } = await register()

      const results = await Promise.all([
        repository.activate(registration, tokenHash),
        repository.activate(registration, tokenHash),
      ])

      expect(results.map((result) => result.status).sort()).toEqual(['activated', 'alreadyUsed'])
    }
  })
})

describe('deleteExpired', () => {
  it('удаляет только записи со сроком раньше now', async () => {
    await register()
    await register({ email: OTHER_EMAIL })

    expect(await repository.deleteExpired(new Date())).toBe(0)
    expect(await repository.deleteExpired(fromNow(REGISTRATION_TTL_MS + hours(1)))).toBe(2)
  })
})
