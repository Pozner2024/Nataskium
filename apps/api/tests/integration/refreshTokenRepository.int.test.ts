import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeRefreshTokenRepository } from '../../src/features/auth'
import type { RefreshTokenRepository } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { createTeacher, days, fromNow, hours, newTokenHash } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const MAX_FAMILIES = 3
const TOKEN_TTL_MS = days(14)
const FAMILY_TTL_MS = days(30)
const PARALLEL_ATTEMPTS = 10
// Семьи упорядочиваются по created_at: паузой даём каждой свою метку времени
const CREATED_AT_GAP_MS = 5

let prisma: PrismaClient
let repository: RefreshTokenRepository
let teacherId: string

function newToken(overrides: { familyId?: string; teacherId?: string; expiresAt?: Date } = {}) {
  return {
    teacherId: overrides.teacherId ?? teacherId,
    familyId: overrides.familyId ?? randomUUID(),
    familyExpiresAt: fromNow(FAMILY_TTL_MS),
    tokenHash: newTokenHash(),
    expiresAt: overrides.expiresAt ?? fromNow(TOKEN_TTL_MS),
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function familiesOf(ownerId: string): Promise<string[]> {
  const rows = await prisma.refreshToken.findMany({ where: { teacherId: ownerId }, select: { familyId: true } })
  return [...new Set(rows.map((row) => row.familyId))].sort()
}

async function createFamilies(count: number, ownerId = teacherId) {
  const tokens = []
  for (let index = 0; index < count; index++) {
    const token = newToken({ teacherId: ownerId })
    await repository.createFamily(token, MAX_FAMILIES)
    tokens.push(token)
    await wait(CREATED_AT_GAP_MS)
  }
  return tokens
}

async function idOf(tokenHash: string): Promise<string> {
  const session = await repository.findByHash(tokenHash)
  if (session === null) throw new Error('token not found')
  return session.id
}

beforeAll(async () => {
  prisma = await createTestPrisma()
  repository = makeRefreshTokenRepository(prisma)
})

beforeEach(async () => {
  await truncateAll(prisma)
  teacherId = (await createTeacher(prisma)).id
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('createFamily', () => {
  it('создаёт токен новой семьи', async () => {
    const token = newToken()

    await repository.createFamily(token, MAX_FAMILIES)

    expect(await repository.findByHash(token.tokenHash)).toMatchObject({
      teacherId,
      familyId: token.familyId,
      revokedAt: null,
    })
  })

  it(`до ${MAX_FAMILIES} семей хранятся все`, async () => {
    const tokens = await createFamilies(MAX_FAMILIES)

    expect(await familiesOf(teacherId)).toEqual(tokens.map((token) => token.familyId).sort())
  })

  it('сверх лимита удаляются самые старые семьи целиком, новая остаётся', async () => {
    const tokens = await createFamilies(MAX_FAMILIES + 2)

    expect(await familiesOf(teacherId)).toEqual(tokens.slice(2).map((token) => token.familyId).sort())
  })

  it('семья с ротацией считается одной и удаляется вместе со всеми своими токенами', async () => {
    const [oldest] = await createFamilies(1)
    const successor = newToken({ familyId: oldest?.familyId })
    expect(await repository.rotate(await idOf(oldest?.tokenHash ?? ''), successor, new Date())).toBe(true)
    await wait(CREATED_AT_GAP_MS)

    const younger = await createFamilies(MAX_FAMILIES)

    expect(await familiesOf(teacherId)).toEqual(younger.map((token) => token.familyId).sort())
    expect(await prisma.refreshToken.count({ where: { familyId: oldest?.familyId } })).toBe(0)
  })

  it('отозванные токены после ротаций не считаются отдельными семьями', async () => {
    const [rotated] = await createFamilies(1)
    let current = rotated?.tokenHash ?? ''
    for (let rotation = 0; rotation < MAX_FAMILIES; rotation++) {
      const next = newToken({ familyId: rotated?.familyId })
      await repository.rotate(await idOf(current), next, new Date())
      current = next.tokenHash
    }

    const [fresh] = await createFamilies(1)

    expect(await familiesOf(teacherId)).toEqual([rotated?.familyId, fresh?.familyId].sort())
  })

  it('семьи, созданные в одну миллисекунду, тоже укладываются в лимит', async () => {
    const tokens = Array.from({ length: MAX_FAMILIES + 2 }, () => newToken())
    for (const token of tokens) await repository.createFamily(token, MAX_FAMILIES)

    const families = await familiesOf(teacherId)
    expect(families).toHaveLength(MAX_FAMILIES)
    expect(families).toContain(tokens.at(-1)?.familyId)
  })

  it('семьи другого учителя не трогает', async () => {
    const otherId = (await createTeacher(prisma)).id
    const others = await createFamilies(MAX_FAMILIES, otherId)

    await createFamilies(MAX_FAMILIES + 1)

    expect(await familiesOf(otherId)).toEqual(others.map((token) => token.familyId).sort())
  })
})

describe('findByHash', () => {
  it('возвращает сессию без хэша токена', async () => {
    const token = newToken()
    await repository.createFamily(token, MAX_FAMILIES)

    const session = await repository.findByHash(token.tokenHash)

    expect(Object.keys(session ?? {}).sort()).toEqual(['expiresAt', 'familyExpiresAt', 'familyId', 'id', 'revokedAt', 'teacherId'])
  })

  it('неизвестный хэш → null', async () => {
    expect(await repository.findByHash(newTokenHash())).toBeNull()
  })
})

describe('rotate', () => {
  it('отзывает старый токен и создаёт преемника в той же семье', async () => {
    const token = newToken()
    await repository.createFamily(token, MAX_FAMILIES)
    const next = newToken({ familyId: token.familyId })

    expect(await repository.rotate(await idOf(token.tokenHash), next, new Date())).toBe(true)

    expect((await repository.findByHash(token.tokenHash))?.revokedAt).toBeInstanceOf(Date)
    expect(await repository.findByHash(next.tokenHash)).toMatchObject({ familyId: token.familyId, revokedAt: null })
  })

  it('повторная ротация того же токена → false, преемник не создаётся', async () => {
    const token = newToken()
    await repository.createFamily(token, MAX_FAMILIES)
    const oldId = await idOf(token.tokenHash)
    await repository.rotate(oldId, newToken({ familyId: token.familyId }), new Date())
    const late = newToken({ familyId: token.familyId })

    expect(await repository.rotate(oldId, late, new Date())).toBe(false)
    expect(await repository.findByHash(late.tokenHash)).toBeNull()
  })

  it('время отзыва — переданное now, а не часы базы или процесса', async () => {
    const token = newToken()
    await repository.createFamily(token, MAX_FAMILIES)
    const revokedAt = fromNow(hours(1))

    await repository.rotate(await idOf(token.tokenHash), newToken({ familyId: token.familyId }), revokedAt)

    expect((await repository.findByHash(token.tokenHash))?.revokedAt).toEqual(revokedAt)
  })

  it('несуществующий токен → false', async () => {
    expect(await repository.rotate(randomUUID(), newToken(), new Date())).toBe(false)
  })

  it('CAS: из двух параллельных ротаций одного токена проходит ровно одна', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      const token = newToken()
      await repository.createFamily(token, MAX_FAMILIES)
      const oldId = await idOf(token.tokenHash)
      const successors = [newToken({ familyId: token.familyId }), newToken({ familyId: token.familyId })]

      const results = await Promise.all(successors.map((next) => repository.rotate(oldId, next, new Date())))

      expect(results.filter(Boolean)).toHaveLength(1)
      expect(await prisma.refreshToken.count({ where: { familyId: token.familyId } })).toBe(2)
      await repository.deleteFamily(token.familyId)
    }
  })

  it('ошибка при создании преемника откатывает отзыв старого токена', async () => {
    const token = newToken()
    await repository.createFamily(token, MAX_FAMILIES)
    // Повтор token_hash нарушает уникальность: транзакция ротации должна откатиться целиком
    const clash = { ...newToken({ familyId: token.familyId }), tokenHash: token.tokenHash }

    await expect(repository.rotate(await idOf(token.tokenHash), clash, new Date())).rejects.toThrow()

    expect((await repository.findByHash(token.tokenHash))?.revokedAt).toBeNull()
  })
})

describe('deleteFamily и deleteAllForTeacher', () => {
  it('deleteFamily удаляет только эту семью', async () => {
    const [first, second] = await createFamilies(2)
    await repository.rotate(await idOf(first?.tokenHash ?? ''), newToken({ familyId: first?.familyId }), new Date())

    await repository.deleteFamily(first?.familyId ?? '')

    expect(await familiesOf(teacherId)).toEqual([second?.familyId])
  })

  it('deleteFamily для неизвестной семьи не падает', async () => {
    await expect(repository.deleteFamily(randomUUID())).resolves.toBeUndefined()
  })

  it('deleteAllForTeacher удаляет все семьи учителя и не трогает чужие', async () => {
    const otherId = (await createTeacher(prisma)).id
    const [other] = await createFamilies(1, otherId)
    await createFamilies(2)

    await repository.deleteAllForTeacher(teacherId)

    expect(await familiesOf(teacherId)).toEqual([])
    expect(await familiesOf(otherId)).toEqual([other?.familyId])
  })
})

describe('deleteExpired', () => {
  it('удаляет истёкшие токены, в том числе отозванные, и возвращает их число', async () => {
    const soon = newToken({ expiresAt: fromNow(hours(1)) })
    const soonRevoked = newToken({ expiresAt: fromNow(hours(1)) })
    await repository.createFamily(soon, MAX_FAMILIES)
    await repository.createFamily(soonRevoked, MAX_FAMILIES)
    await prisma.refreshToken.updateMany({ where: { tokenHash: soonRevoked.tokenHash }, data: { revokedAt: new Date() } })

    expect(await repository.deleteExpired(fromNow(hours(2)))).toBe(2)
    expect(await prisma.refreshToken.count()).toBe(0)
  })

  it('не удаляет отозванные неистёкшие: по ним ловится повторное использование', async () => {
    const token = newToken()
    await repository.createFamily(token, MAX_FAMILIES)
    await repository.rotate(await idOf(token.tokenHash), newToken({ familyId: token.familyId }), new Date())

    expect(await repository.deleteExpired(new Date())).toBe(0)
    expect((await repository.findByHash(token.tokenHash))?.revokedAt).toBeInstanceOf(Date)
  })

  it('токен со сроком ровно now не удаляется: удаляются только expires_at < now', async () => {
    const expiresAt = fromNow(hours(1))
    const token = newToken({ expiresAt })
    await repository.createFamily(token, MAX_FAMILIES)

    expect(await repository.deleteExpired(expiresAt)).toBe(0)
    expect(await repository.deleteExpired(new Date(expiresAt.getTime() + 1))).toBe(1)
  })
})
