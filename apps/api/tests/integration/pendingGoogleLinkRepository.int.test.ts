import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makePendingGoogleLinkRepository } from '../../src/features/auth'
import type { PendingGoogleLinkRepository } from '../../src/features/auth/types'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { ARGON2ID_HASH, fromNow, newTokenHash } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const EMAIL = 'qa-anna@example.test'
const GOOGLE_ID = 'google-sub-anna'
const LINK_TTL_MS = 10 * 60 * 1000
const PARALLEL_ATTEMPTS = 10

let prisma: PrismaClient
let repository: PendingGoogleLinkRepository
let teacherId: string

async function issue(options: { googleId?: string; expiresAt?: Date; forTeacher?: string; linkSecretHash?: string } = {}) {
  const tokenHash = newTokenHash()
  await repository.replaceForTeacher({
    teacherId: options.forTeacher ?? teacherId,
    googleId: options.googleId ?? GOOGLE_ID,
    tokenHash,
    linkSecretHash: options.linkSecretHash ?? newTokenHash(),
    expiresAt: options.expiresAt ?? fromNow(LINK_TTL_MS),
  })
  const link = await repository.findByTokenHash(tokenHash)
  if (link === null) throw new Error('link not found')
  return { link, tokenHash }
}

beforeAll(async () => {
  prisma = await createTestPrisma()
  repository = makePendingGoogleLinkRepository(prisma)
})

beforeEach(async () => {
  await truncateAll(prisma)
  const teacher = await prisma.teacher.create({ data: { email: EMAIL, passwordHash: ARGON2ID_HASH, displayName: 'Анна', emailVerifiedAt: new Date() } })
  teacherId = teacher.id
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('replaceForTeacher и findByTokenHash', () => {
  it('находит привязку с email и хэшем пароля учителя и хэшем секрета cookie, без хэша токена', async () => {
    const linkSecretHash = newTokenHash()
    const { link } = await issue({ linkSecretHash })

    expect(link).toEqual({
      id: expect.any(String),
      teacherId,
      googleId: GOOGLE_ID,
      linkSecretHash,
      expiresAt: expect.any(Date),
      teacherEmail: EMAIL,
      teacherPasswordHash: ARGON2ID_HASH,
    })
  })

  it('повторный callback заменяет привязку: старый хэш не находится, запись одна, googleId новый', async () => {
    const first = await issue()

    const secondSecretHash = newTokenHash()
    const second = await issue({ googleId: 'google-sub-second', linkSecretHash: secondSecretHash })

    expect(await repository.findByTokenHash(first.tokenHash)).toBeNull()
    expect(second.link.googleId).toBe('google-sub-second')
    expect(second.link.linkSecretHash).toBe(secondSecretHash)
    expect(await prisma.pendingGoogleLink.count()).toBe(1)
  })

  it('вторую запись тому же учителю база не принимает (P2002)', async () => {
    await issue()

    await expect(
      prisma.pendingGoogleLink.create({ data: { teacherId, googleId: GOOGLE_ID, tokenHash: newTokenHash(), linkSecretHash: newTokenHash(), expiresAt: fromNow(LINK_TTL_MS) } }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('удаление учителя удаляет его привязку каскадом', async () => {
    await issue()

    await prisma.teacher.delete({ where: { id: teacherId } })

    expect(await prisma.pendingGoogleLink.count()).toBe(0)
  })
})

describe('completeLink', () => {
  it('записывает googleId, удаляет привязку, пароль учителя сохраняется', async () => {
    const { link, tokenHash } = await issue()

    const result = await repository.completeLink(link, tokenHash, new Date())

    expect(result).toMatchObject({ status: 'linked', teacher: { id: teacherId, email: EMAIL, googleId: GOOGLE_ID, displayName: 'Анна' } })
    expect(await prisma.teacher.findUnique({ where: { id: teacherId } })).toMatchObject({ googleId: GOOGLE_ID, passwordHash: ARGON2ID_HASH })
    expect(await prisma.pendingGoogleLink.count()).toBe(0)
  })

  it('повтор той же ссылкой — invalid', async () => {
    const { link, tokenHash } = await issue()
    await repository.completeLink(link, tokenHash, new Date())

    expect(await repository.completeLink(link, tokenHash, new Date())).toEqual({ status: 'invalid' })
  })

  it('now позже срока — invalid, googleId не записан', async () => {
    const { link, tokenHash } = await issue()

    expect(await repository.completeLink(link, tokenHash, fromNow(LINK_TTL_MS + 1000))).toEqual({ status: 'invalid' })
    expect((await prisma.teacher.findUnique({ where: { id: teacherId } }))?.googleId).toBeNull()
  })

  it('старая ссылка после повторного callback — invalid', async () => {
    const old = await issue()
    await issue()

    expect(await repository.completeLink(old.link, old.tokenHash, new Date())).toEqual({ status: 'invalid' })
  })

  it('этот Google-аккаунт уже у другого учителя — conflict, ссылка не сгорает, googleId учителя не меняется', async () => {
    await prisma.teacher.create({ data: { email: 'qa-boris@example.test', googleId: GOOGLE_ID, emailVerifiedAt: new Date() } })
    const { link, tokenHash } = await issue()

    expect(await repository.completeLink(link, tokenHash, new Date())).toEqual({ status: 'conflict' })
    expect((await prisma.teacher.findUnique({ where: { id: teacherId } }))?.googleId).toBeNull()
  })

  it('к учителю уже привязан другой Google — conflict, его googleId не перезаписывается', async () => {
    const { link, tokenHash } = await issue()
    await prisma.teacher.update({ where: { id: teacherId }, data: { googleId: 'google-sub-other' } })

    expect(await repository.completeLink(link, tokenHash, new Date())).toEqual({ status: 'conflict' })
    expect((await prisma.teacher.findUnique({ where: { id: teacherId } }))?.googleId).toBe('google-sub-other')
  })

  it('тот же Google уже привязан (параллельный вход) — linked', async () => {
    const { link, tokenHash } = await issue()
    await prisma.teacher.update({ where: { id: teacherId }, data: { googleId: GOOGLE_ID } })

    expect(await repository.completeLink(link, tokenHash, new Date())).toMatchObject({ status: 'linked' })
  })

  it('CAS: два параллельных подтверждения одной ссылкой — ровно один linked', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      await prisma.teacher.update({ where: { id: teacherId }, data: { googleId: null } })
      const { link, tokenHash } = await issue()

      const results = await Promise.all([repository.completeLink(link, tokenHash, new Date()), repository.completeLink(link, tokenHash, new Date())])

      expect(results.map((result) => result.status).sort()).toEqual(['invalid', 'linked'])
    }
  })
})

describe('deleteExpired', () => {
  it('удаляет только привязки со сроком раньше now; срок ровно now остаётся', async () => {
    const expiresAt = fromNow(LINK_TTL_MS)
    await issue({ expiresAt })

    expect(await repository.deleteExpired(expiresAt)).toBe(0)
    expect(await repository.deleteExpired(new Date(expiresAt.getTime() + 1))).toBe(1)
  })
})
