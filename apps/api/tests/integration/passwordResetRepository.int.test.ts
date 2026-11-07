import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makePasswordResetRepository } from '../../src/features/auth'
import type { PasswordResetRepository } from '../../src/features/auth/types'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { ARGON2ID_HASH, createTeacher, days, fromNow, hours, newTokenHash } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const NEW_HASH = `${ARGON2ID_HASH}-new`
const RESET_TTL_MS = hours(1)
const PARALLEL_ATTEMPTS = 10

let prisma: PrismaClient
let repository: PasswordResetRepository
let teacherId: string
let otherTeacherId: string

async function issue(forTeacher = teacherId, expiresAt = fromNow(RESET_TTL_MS)) {
  const tokenHash = newTokenHash()
  await repository.replaceForTeacher({ teacherId: forTeacher, tokenHash, expiresAt })
  const reset = await repository.findByTokenHash(tokenHash)
  if (reset === null) throw new Error('reset not found')
  return { reset, tokenHash }
}

async function seedSession(ownerId: string) {
  await prisma.refreshToken.create({
    data: {
      teacherId: ownerId,
      familyId: randomUUID(),
      familyExpiresAt: fromNow(days(30)),
      tokenHash: newTokenHash(),
      expiresAt: fromNow(days(14)),
    },
  })
}

beforeAll(async () => {
  prisma = await createTestPrisma()
  repository = makePasswordResetRepository(prisma)
})

beforeEach(async () => {
  await truncateAll(prisma)
  teacherId = (await createTeacher(prisma)).id
  otherTeacherId = (await createTeacher(prisma)).id
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('replaceForTeacher и findByTokenHash', () => {
  it('находит ссылку по хэшу, без самого хэша', async () => {
    const { reset } = await issue()

    expect(Object.keys(reset).sort()).toEqual(['expiresAt', 'id', 'teacherId'])
    expect(reset.teacherId).toBe(teacherId)
  })

  it('новая ссылка удаляет прежние ссылки учителя, чужие остаются', async () => {
    const first = await issue()
    const foreign = await issue(otherTeacherId)

    const second = await issue()

    expect(await repository.findByTokenHash(first.tokenHash)).toBeNull()
    expect(await repository.findByTokenHash(second.tokenHash)).not.toBeNull()
    expect(await repository.findByTokenHash(foreign.tokenHash)).not.toBeNull()
    expect(await prisma.passwordReset.count({ where: { teacherId } })).toBe(1)
  })

  it('replaceForTeacher заменяет ссылку: старый хэш не находится, новый срок записан', async () => {
    const first = await issue()
    const laterExpiry = fromNow(RESET_TTL_MS + hours(1))

    const second = await issue(teacherId, laterExpiry)

    expect(await repository.findByTokenHash(first.tokenHash)).toBeNull()
    expect(second.reset.expiresAt).toEqual(laterExpiry)
    expect(await prisma.passwordReset.count({ where: { teacherId } })).toBe(1)
  })

  it('гонка: параллельные replaceForTeacher одного учителя — без ошибки, ссылка одна', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      await prisma.passwordReset.deleteMany({ where: { teacherId } })
      const hashes = [newTokenHash(), newTokenHash(), newTokenHash()]

      await Promise.all(hashes.map((tokenHash) => repository.replaceForTeacher({ teacherId, tokenHash, expiresAt: fromNow(RESET_TTL_MS) })))

      const rows = await prisma.passwordReset.findMany({ where: { teacherId }, select: { tokenHash: true } })
      expect(rows).toHaveLength(1)
      expect(hashes).toContain(rows[0]?.tokenHash)
    }
  })

  it('неизвестный хэш → null', async () => {
    expect(await repository.findByTokenHash(newTokenHash())).toBeNull()
  })

  it('учителя нет (P2003) → false, записи нет', async () => {
    expect(await repository.replaceForTeacher({ teacherId: randomUUID(), tokenHash: newTokenHash(), expiresAt: fromNow(RESET_TTL_MS) })).toBe(false)
    expect(await prisma.passwordReset.count()).toBe(0)
  })

  it('после удаления учителя → false; ссылки других учителей целы', async () => {
    const foreign = await issue(otherTeacherId)
    await prisma.teacher.delete({ where: { id: teacherId } })

    expect(await repository.replaceForTeacher({ teacherId, tokenHash: newTokenHash(), expiresAt: fromNow(RESET_TTL_MS) })).toBe(false)
    expect(await repository.findByTokenHash(foreign.tokenHash)).not.toBeNull()
  })

  it('другие ошибки базы (чужой token_hash, P2002) — не false, а исключение', async () => {
    const foreign = await issue(otherTeacherId)

    await expect(repository.replaceForTeacher({ teacherId, tokenHash: foreign.tokenHash, expiresAt: fromNow(RESET_TTL_MS) })).rejects.toThrow()
  })

  it('удаление учителя удаляет его ссылки каскадом', async () => {
    await issue()

    await prisma.teacher.delete({ where: { id: teacherId } })

    expect(await prisma.passwordReset.count()).toBe(0)
  })
})

describe('completeReset', () => {
  it('меняет хэш пароля, удаляет все ссылки и все refresh-токены учителя, чужие не трогает', async () => {
    await seedSession(teacherId)
    await seedSession(teacherId)
    await seedSession(otherTeacherId)
    await issue(otherTeacherId)
    const { reset, tokenHash } = await issue()

    const teacher = await prisma.teacher.update({ where: { id: teacherId }, data: { displayName: 'Анна' } })

    expect(await repository.completeReset(reset, tokenHash, NEW_HASH, new Date())).toEqual({
      status: 'reset',
      teacher: { email: teacher.email, displayName: 'Анна' },
    })

    expect((await prisma.teacher.findUnique({ where: { id: teacherId } }))?.passwordHash).toBe(NEW_HASH)
    expect((await prisma.teacher.findUnique({ where: { id: otherTeacherId } }))?.passwordHash).toBe(ARGON2ID_HASH)
    expect(await prisma.passwordReset.count({ where: { teacherId } })).toBe(0)
    expect(await prisma.refreshToken.count({ where: { teacherId } })).toBe(0)
    expect(await prisma.refreshToken.count({ where: { teacherId: otherTeacherId } })).toBe(1)
    expect(await prisma.passwordReset.count({ where: { teacherId: otherTeacherId } })).toBe(1)
  })

  // Уникальный индекс по teacher_id: у учителя не бывает двух ссылок, даже при гонке двух запросов сброса
  it('вторую ссылку тому же учителю в обход replaceForTeacher база не принимает (P2002)', async () => {
    await issue()

    await expect(
      prisma.passwordReset.create({ data: { teacherId, tokenHash: newTokenHash(), expiresAt: fromNow(RESET_TTL_MS) } }),
    ).rejects.toMatchObject({ code: 'P2002' })
    expect(await prisma.passwordReset.count({ where: { teacherId } })).toBe(1)
  })

  it('после сброса у учителя не остаётся ни одной ссылки', async () => {
    const { reset, tokenHash } = await issue()

    await repository.completeReset(reset, tokenHash, NEW_HASH, new Date())

    expect(await prisma.passwordReset.count({ where: { teacherId } })).toBe(0)
  })

  // Привязка ждала старый пароль: после сброса её нельзя завершить
  it('удаляет незавершённую привязку Google этого учителя, чужую не трогает', async () => {
    const seedLink = (ownerId: string) =>
      prisma.pendingGoogleLink.create({
        data: { teacherId: ownerId, googleId: `google-${ownerId}`, tokenHash: newTokenHash(), linkSecretHash: newTokenHash(), expiresAt: fromNow(RESET_TTL_MS) },
      })
    await seedLink(teacherId)
    await seedLink(otherTeacherId)
    const { reset, tokenHash } = await issue()

    await repository.completeReset(reset, tokenHash, NEW_HASH, new Date())

    expect(await prisma.pendingGoogleLink.count({ where: { teacherId } })).toBe(0)
    expect(await prisma.pendingGoogleLink.count({ where: { teacherId: otherTeacherId } })).toBe(1)
  })

  it('повторно той же ссылкой — invalid, пароль не меняется второй раз', async () => {
    const { reset, tokenHash } = await issue()
    await repository.completeReset(reset, tokenHash, NEW_HASH, new Date())

    expect(await repository.completeReset(reset, tokenHash, `${ARGON2ID_HASH}-third`, new Date())).toEqual({ status: 'invalid' })
    expect((await prisma.teacher.findUnique({ where: { id: teacherId } }))?.passwordHash).toBe(NEW_HASH)
  })

  it('now позже срока ссылки — invalid, ни пароль, ни сессии не тронуты', async () => {
    await seedSession(teacherId)
    const { reset, tokenHash } = await issue()

    expect(await repository.completeReset(reset, tokenHash, NEW_HASH, fromNow(RESET_TTL_MS + hours(1)))).toEqual({ status: 'invalid' })
    expect((await prisma.teacher.findUnique({ where: { id: teacherId } }))?.passwordHash).toBe(ARGON2ID_HASH)
    expect(await prisma.refreshToken.count({ where: { teacherId } })).toBe(1)
  })

  it('хэш от другой ссылки — invalid, обе ссылки на месте', async () => {
    const own = await issue()
    const foreign = await issue(otherTeacherId)

    expect(await repository.completeReset(own.reset, foreign.tokenHash, NEW_HASH, new Date())).toEqual({ status: 'invalid' })
    expect(await prisma.passwordReset.count()).toBe(2)
  })

  it('старая ссылка после запроса новой — invalid', async () => {
    const old = await issue()
    await issue()

    expect(await repository.completeReset(old.reset, old.tokenHash, NEW_HASH, new Date())).toEqual({ status: 'invalid' })
  })

  it('CAS: два параллельных сброса одной ссылкой — ровно один успех', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      const { reset, tokenHash } = await issue()

      const results = await Promise.all([
        repository.completeReset(reset, tokenHash, `${NEW_HASH}-a`, new Date()),
        repository.completeReset(reset, tokenHash, `${NEW_HASH}-b`, new Date()),
      ])

      expect(results.map((result) => result.status).sort()).toEqual(['invalid', 'reset'])
    }
  })
})

describe('deleteExpired', () => {
  it('удаляет только ссылки со сроком раньше now', async () => {
    await issue()
    await issue(otherTeacherId)

    expect(await repository.deleteExpired(new Date())).toBe(0)
    expect(await repository.deleteExpired(fromNow(RESET_TTL_MS + 1))).toBe(2)
  })

  it('ссылка со сроком ровно now не удаляется', async () => {
    const expiresAt = fromNow(RESET_TTL_MS)
    await issue(teacherId, expiresAt)

    expect(await repository.deleteExpired(expiresAt)).toBe(0)
    expect(await repository.deleteExpired(new Date(expiresAt.getTime() + 1))).toBe(1)
  })
})
