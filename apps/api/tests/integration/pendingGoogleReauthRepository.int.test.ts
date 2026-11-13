import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makePendingGoogleReauthRepository } from '../../src/features/auth'
import type { PendingGoogleReauthRepository } from '../../src/features/auth/types'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { ARGON2ID_HASH, createTeacher, fromNow, newTokenHash } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const TTL_MS = 5 * 60 * 1000
const NOW = () => new Date()

let prisma: PrismaClient
let repository: PendingGoogleReauthRepository

// Подтверждение удаления через Google на настоящей базе: CAS по id, stateHash и сроку, одна запись на учителя
async function googleTeacher(email?: string) {
  return prisma.teacher.create({ data: { email: email ?? `qa-${newTokenHash().slice(0, 8)}@example.test`, passwordHash: null, googleId: `sub-${newTokenHash().slice(0, 8)}`, emailVerifiedAt: new Date() } })
}

async function start(teacherId: string, stateHash = newTokenHash(), expiresAt = fromNow(TTL_MS)) {
  await repository.replaceForTeacher({ teacherId, stateHash, expiresAt })
  return stateHash
}

beforeAll(async () => {
  prisma = await createTestPrisma()
  repository = makePendingGoogleReauthRepository(prisma)
})

beforeEach(async () => {
  await truncateAll(prisma)
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('pendingGoogleReauthRepository на настоящей базе', () => {
  it('replaceForTeacher: учителя нет (удалён между проверкой и записью) — false, записи нет', async () => {
    const saved = await repository.replaceForTeacher({ teacherId: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b', stateHash: newTokenHash(), expiresAt: fromNow(TTL_MS) })

    expect(saved).toBe(false)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
  })

  it('replaceForTeacher: новый запуск заменяет прежний, старый state не находится', async () => {
    const teacher = await googleTeacher()
    const first = await start(teacher.id)
    const second = await start(teacher.id)

    expect(await prisma.pendingGoogleReauth.count({ where: { teacherId: teacher.id } })).toBe(1)
    expect(await repository.findByStateHash(first)).toBeNull()
    expect((await repository.findByStateHash(second))?.teacherId).toBe(teacher.id)
  })

  it('deleteAccount: без пароля — deleted, учитель и запись удалены', async () => {
    const teacher = await googleTeacher()
    const stateHash = await start(teacher.id)
    const reauth = (await repository.findByStateHash(stateHash))!

    expect(await repository.deleteAccount(reauth, stateHash, NOW())).toBe('deleted')
    expect(await prisma.teacher.count({ where: { id: teacher.id } })).toBe(0)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
  })

  it('deleteAccount: появился пароль — hasPassword, запись снята, учитель на месте', async () => {
    const teacher = await googleTeacher()
    const stateHash = await start(teacher.id)
    const reauth = (await repository.findByStateHash(stateHash))!
    await prisma.teacher.update({ where: { id: teacher.id }, data: { passwordHash: ARGON2ID_HASH } })

    expect(await repository.deleteAccount(reauth, stateHash, NOW())).toBe('hasPassword')
    expect(await prisma.teacher.count({ where: { id: teacher.id } })).toBe(1)
    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
  })

  it('deleteAccount: повтор после удаления — invalid, второго удаления нет', async () => {
    const teacher = await googleTeacher()
    const stateHash = await start(teacher.id)
    const reauth = (await repository.findByStateHash(stateHash))!

    await repository.deleteAccount(reauth, stateHash, NOW())

    expect(await repository.deleteAccount(reauth, stateHash, NOW())).toBe('invalid')
  })

  it('deleteAccount: срок вышел до транзакции — invalid, учитель цел', async () => {
    const teacher = await googleTeacher()
    const stateHash = await start(teacher.id, newTokenHash(), fromNow(TTL_MS))
    const reauth = (await repository.findByStateHash(stateHash))!

    expect(await repository.deleteAccount(reauth, stateHash, fromNow(TTL_MS * 2))).toBe('invalid')
    expect(await prisma.teacher.count({ where: { id: teacher.id } })).toBe(1)
  })

  it('deleteExpired: удаляет только истёкшие записи и возвращает их число', async () => {
    const expired = await googleTeacher()
    const alive = await googleTeacher()
    await prisma.pendingGoogleReauth.create({
      data: { teacherId: expired.id, stateHash: newTokenHash(), createdAt: fromNow(-2 * TTL_MS), expiresAt: fromNow(-TTL_MS) },
    })
    await start(alive.id)

    expect(await repository.deleteExpired(NOW())).toBe(1)
    expect(await prisma.pendingGoogleReauth.count({ where: { teacherId: alive.id } })).toBe(1)
  })

  it('удаление учителя каскадом снимает его запись', async () => {
    const teacher = await createTeacher(prisma, 'qa-cascade@example.test')
    await start(teacher.id)

    await prisma.teacher.delete({ where: { id: teacher.id } })

    expect(await prisma.pendingGoogleReauth.count()).toBe(0)
  })
})
