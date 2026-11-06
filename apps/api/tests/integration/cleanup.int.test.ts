import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthCleanup } from '../../src/app'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { ARGON2ID_HASH, createTeacher, days, fromNow, hours, newTokenHash } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

let prisma: PrismaClient
let teacherId: string

// created_at в прошлом явно: иначе CHECK expires_at > created_at не дал бы вставить истёкшую строку
async function token(name: string, times: { createdAgo: number; expiresIn: number; revoked?: boolean }) {
  await prisma.refreshToken.create({
    data: {
      teacherId,
      familyId: randomUUID(),
      familyExpiresAt: fromNow(days(30)),
      tokenHash: newTokenHash(),
      createdAt: fromNow(-times.createdAgo),
      expiresAt: fromNow(times.expiresIn),
      revokedAt: times.revoked ? fromNow(-hours(1)) : null,
    },
  })
  return name
}

async function registration(email: string, times: { createdAgo: number; expiresIn: number }) {
  await prisma.pendingRegistration.create({
    data: {
      email,
      passwordHash: ARGON2ID_HASH,
      tokenHash: newTokenHash(),
      createdAt: fromNow(-times.createdAgo),
      expiresAt: fromNow(times.expiresIn),
    },
  })
}

// У учителя одна ссылка сброса (уникальный teacher_id): для двух ссылок нужны два учителя
async function passwordReset(times: { createdAgo: number; expiresIn: number }) {
  const owner = (await createTeacher(prisma)).id
  await prisma.passwordReset.create({
    data: { teacherId: owner, tokenHash: newTokenHash(), createdAt: fromNow(-times.createdAgo), expiresAt: fromNow(times.expiresIn) },
  })
}

// У учителя одна незавершённая привязка Google (уникальный teacher_id)
async function googleLink(times: { createdAgo: number; expiresIn: number }) {
  const owner = (await createTeacher(prisma)).id
  await prisma.pendingGoogleLink.create({
    data: { teacherId: owner, googleId: `google-${owner}`, tokenHash: newTokenHash(), linkSecretHash: newTokenHash(), createdAt: fromNow(-times.createdAgo), expiresAt: fromNow(times.expiresIn) },
  })
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
  teacherId = (await createTeacher(prisma)).id
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('createAuthCleanup на настоящей базе', () => {
  it('удаляет истёкшие токен и регистрацию, оставляет действующие и отозванный неистёкший', async () => {
    await token('expired', { createdAgo: days(15), expiresIn: -hours(1) })
    await token('expired-revoked', { createdAgo: days(15), expiresIn: -hours(1), revoked: true })
    await token('revoked-alive', { createdAgo: days(1), expiresIn: days(13), revoked: true })
    await token('active', { createdAgo: days(1), expiresIn: days(13) })
    await registration('qa-old@example.test', { createdAgo: days(2), expiresIn: -hours(1) })
    await registration('qa-fresh@example.test', { createdAgo: hours(1), expiresIn: hours(23) })
    await passwordReset({ createdAgo: hours(2), expiresIn: -hours(1) })
    await passwordReset({ createdAgo: hours(0.1), expiresIn: hours(0.9) })
    await googleLink({ createdAgo: hours(1), expiresIn: -hours(0.5) })
    await googleLink({ createdAgo: hours(0.05), expiresIn: hours(0.1) })

    await createAuthCleanup(prisma)()

    const tokens = await prisma.refreshToken.findMany({ select: { revokedAt: true } })
    expect(tokens.map((row) => row.revokedAt !== null).sort()).toEqual([false, true])
    expect((await prisma.pendingRegistration.findMany({ select: { email: true } })).map((row) => row.email)).toEqual([
      'qa-fresh@example.test',
    ])
    expect(console.log).toHaveBeenCalledWith('[cleanup] expired auth records removed', {
      refreshTokens: 2,
      pendingRegistrations: 1,
      passwordResets: 1,
      pendingGoogleLinks: 1,
    })
    expect(await prisma.pendingGoogleLink.count()).toBe(1)
    expect((await prisma.passwordReset.findMany({ select: { expiresAt: true } })).map((row) => row.expiresAt > new Date())).toEqual([true])
  })

  it('повторный запуск ничего не удаляет и не пишет в лог', async () => {
    await token('expired', { createdAgo: days(15), expiresIn: -hours(1) })
    await token('active', { createdAgo: days(1), expiresIn: days(13) })
    const cleanup = createAuthCleanup(prisma)
    await cleanup()
    vi.mocked(console.log).mockClear()

    await cleanup()

    expect(await prisma.refreshToken.count()).toBe(1)
    expect(console.log).not.toHaveBeenCalled()
  })

  it('учителя и их данные не трогает', async () => {
    await token('expired', { createdAgo: days(15), expiresIn: -hours(1) })
    await passwordReset({ createdAgo: hours(2), expiresIn: -hours(1) })

    await createAuthCleanup(prisma)()

    expect(await prisma.teacher.count()).toBe(2)
  })
})
