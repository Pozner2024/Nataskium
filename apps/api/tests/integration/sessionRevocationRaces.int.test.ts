import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MAX_ACTIVE_SESSIONS, makePasswordResetRepository, makeRefreshTokenRepository, makeTeacherRepository } from '../../src/features/auth'
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client'
import { ARGON2ID_HASH, days, fromNow, hours, newTokenHash } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const NEW_HASH = '$argon2id$v=19$m=19456,t=2,p=1$bmV3$bmV3aGFzaA'
// Сколько ждать, пока отзыв встанет в очередь за блокировкой (или завершится, если блокировки нет — старый код)
const WAIT_PROBE_TIMEOUT_MS = 3000
const WAIT_PROBE_INTERVAL_MS = 20

let prisma: PrismaClient

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function bound(target: object, property: string | symbol): unknown {
  const value: unknown = Reflect.get(target, property)
  return typeof value === 'function' ? value.bind(target) : value
}

// Клиент, у которого транзакция останавливается сразу после INSERT refresh-токена — с незакоммиченной вставкой
function pausingAfterTokenInsert() {
  const inserted = deferred()
  const proceed = deferred()

  function pausingTx(tx: Prisma.TransactionClient): Prisma.TransactionClient {
    return new Proxy(tx, {
      get(target, property) {
        if (property !== 'refreshToken') return bound(target, property)
        return new Proxy(target.refreshToken, {
          get(delegate, method) {
            if (method !== 'create') return bound(delegate, method)
            return async (args: Prisma.RefreshTokenCreateArgs) => {
              const row = await delegate.create(args)
              inserted.resolve()
              await proceed.promise
              return row
            }
          },
        })
      },
    })
  }

  const client = new Proxy(prisma, {
    get(target, property) {
      if (property !== '$transaction') return bound(target, property)
      return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction((tx) => run(pausingTx(tx)))
    },
  }) as PrismaClient
  return { client, inserted: inserted.promise, proceed: proceed.resolve }
}

// Отзыв либо встал в очередь за блокировкой, либо уже завершился (без блокировки — старый код): тест не висит
async function waitUntilBlockedOrSettled(revocation: Promise<unknown>): Promise<void> {
  let settled = false
  void revocation.finally(() => {
    settled = true
  })
  const deadline = Date.now() + WAIT_PROBE_TIMEOUT_MS
  while (Date.now() < deadline && !settled) {
    const rows = await prisma.$queryRaw<{ waiting: bigint }[]>`
      SELECT count(*) AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
    `
    if (Number(rows[0]?.waiting ?? 0) > 0) return
    await new Promise((resolve) => setTimeout(resolve, WAIT_PROBE_INTERVAL_MS))
  }
}

async function teacherWithToken() {
  const teacher = await prisma.teacher.create({
    data: { email: `qa-${randomUUID()}@example.test`, passwordHash: ARGON2ID_HASH, emailVerifiedAt: new Date() },
  })
  const token = await prisma.refreshToken.create({
    data: { teacherId: teacher.id, familyId: randomUUID(), familyExpiresAt: fromNow(days(30)), tokenHash: newTokenHash(), expiresAt: fromNow(days(14)) },
  })
  return { teacher, token }
}

function nextToken(teacherId: string, familyId: string = randomUUID()) {
  return { teacherId, familyId, familyExpiresAt: fromNow(days(30)), tokenHash: newTokenHash(), expiresAt: fromNow(days(14)) }
}

async function resetFor(teacherId: string) {
  const tokenHash = newTokenHash()
  const reset = await prisma.passwordReset.create({ data: { teacherId, tokenHash, expiresAt: fromNow(hours(1)) } })
  return { reset: { id: reset.id, teacherId, expiresAt: reset.expiresAt }, tokenHash }
}

type Revocation = { name: string; revoke: (teacherId: string) => Promise<unknown> }

const REVOCATIONS: Revocation[] = [
  { name: 'logout-all', revoke: (teacherId) => makeRefreshTokenRepository(prisma).deleteAllForTeacher(teacherId) },
  {
    name: 'сброс пароля',
    revoke: async (teacherId) => {
      const { reset, tokenHash } = await resetFor(teacherId)
      return makePasswordResetRepository(prisma).completeReset(reset, tokenHash, NEW_HASH, new Date())
    },
  },
  { name: 'смена пароля', revoke: (teacherId) => makeTeacherRepository(prisma).changePassword(teacherId, ARGON2ID_HASH, NEW_HASH) },
]

describe('выдача и ротация сессии параллельно с отзывом', () => {
  it.each(REVOCATIONS)('ротация с незакоммиченным преемником ↔ $name: после обоих токенов учителя нет', async ({ revoke }) => {
    const { teacher, token } = await teacherWithToken()
    const pausing = pausingAfterTokenInsert()
    const rotation = makeRefreshTokenRepository(pausing.client).rotate(token.id, nextToken(teacher.id, token.familyId), new Date())
    await pausing.inserted

    const revocation = revoke(teacher.id)
    await waitUntilBlockedOrSettled(revocation)
    pausing.proceed()
    await Promise.all([rotation, revocation])

    expect(await prisma.refreshToken.count({ where: { teacherId: teacher.id } })).toBe(0)
  })

  it.each(REVOCATIONS)('новая семья с незакоммиченной вставкой ↔ $name: после обоих токенов учителя нет', async ({ revoke }) => {
    const { teacher } = await teacherWithToken()
    const pausing = pausingAfterTokenInsert()
    const creation = makeRefreshTokenRepository(pausing.client).createFamily(nextToken(teacher.id), MAX_ACTIVE_SESSIONS)
    await pausing.inserted

    const revocation = revoke(teacher.id)
    await waitUntilBlockedOrSettled(revocation)
    pausing.proceed()
    await Promise.all([creation, revocation])

    expect(await prisma.refreshToken.count({ where: { teacherId: teacher.id } })).toBe(0)
  })

  it('вход сверил старый пароль, сброс прошёл раньше выдачи — семья не создаётся', async () => {
    const { teacher } = await teacherWithToken()
    const { reset, tokenHash } = await resetFor(teacher.id)
    await makePasswordResetRepository(prisma).completeReset(reset, tokenHash, NEW_HASH, new Date())

    const created = await makeRefreshTokenRepository(prisma).createFamily(nextToken(teacher.id), MAX_ACTIVE_SESSIONS, ARGON2ID_HASH)

    expect(created).toBe(false)
    expect(await prisma.refreshToken.count({ where: { teacherId: teacher.id } })).toBe(0)
  })

  it('сверенный хэш ещё текущий — семья создаётся', async () => {
    const { teacher } = await teacherWithToken()

    expect(await makeRefreshTokenRepository(prisma).createFamily(nextToken(teacher.id), MAX_ACTIVE_SESSIONS, ARGON2ID_HASH)).toBe(true)
    expect(await prisma.refreshToken.count({ where: { teacherId: teacher.id } })).toBe(2)
  })

  it('несовпадение хэша не вытесняет старые семьи', async () => {
    const { teacher } = await teacherWithToken()
    for (let index = 1; index < MAX_ACTIVE_SESSIONS; index++) {
      await prisma.refreshToken.create({ data: nextToken(teacher.id) })
    }

    expect(await makeRefreshTokenRepository(prisma).createFamily(nextToken(teacher.id), MAX_ACTIVE_SESSIONS, NEW_HASH)).toBe(false)
    expect(await prisma.refreshToken.count({ where: { teacherId: teacher.id } })).toBe(MAX_ACTIVE_SESSIONS)
  })
})
