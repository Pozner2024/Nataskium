import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MAX_ACTIVE_SESSIONS, makePendingRegistrationRepository, makeRefreshTokenRepository, makeTeacherRepository } from '../../src/features/auth'
import type { PendingRegistrationRepository, RefreshTokenRepository, TeacherRepository } from '../../src/features/auth/types'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { ARGON2ID_HASH, days, fromNow, hours, newTokenHash } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const EMAIL = 'qa-anna@example.test'
const OTHER_EMAIL = 'qa-boris@example.test'
const PARALLEL_ATTEMPTS = 10
// Взаимоблокировка rotate ↔ deleteAccount воспроизводилась примерно в 2% попыток: нужна серия
const ROTATE_RACE_ATTEMPTS = 150
// Сколько ждать, чтобы убедиться, что удаление стоит в очереди: с запасом против медленной машины
const LOCK_WAIT_PROBE_MS = 300

let prisma: PrismaClient
let teachers: TeacherRepository
let pending: PendingRegistrationRepository
let refreshTokens: RefreshTokenRepository

async function teacherWithEverything(email: string) {
  const teacher = await prisma.teacher.create({ data: { email, passwordHash: ARGON2ID_HASH, displayName: 'Анна', emailVerifiedAt: new Date() } })
  await prisma.refreshToken.create({
    data: { teacherId: teacher.id, familyId: randomUUID(), familyExpiresAt: fromNow(days(30)), tokenHash: newTokenHash(), expiresAt: fromNow(days(14)) },
  })
  await prisma.passwordReset.create({ data: { teacherId: teacher.id, tokenHash: newTokenHash(), expiresAt: fromNow(hours(1)) } })
  await prisma.pendingGoogleLink.create({
    data: { teacherId: teacher.id, googleId: `google-${teacher.id}`, tokenHash: newTokenHash(), linkSecretHash: newTokenHash(), expiresAt: fromNow(hours(0.1)) },
  })
  await prisma.pendingRegistration.create({ data: { email, passwordHash: `${ARGON2ID_HASH}-pending`, tokenHash: newTokenHash(), expiresAt: fromNow(days(1)) } })
  return teacher
}

async function countsFor(teacherId: string, email: string) {
  return {
    teachers: await prisma.teacher.count({ where: { id: teacherId } }),
    refreshTokens: await prisma.refreshToken.count({ where: { teacherId } }),
    passwordResets: await prisma.passwordReset.count({ where: { teacherId } }),
    pendingGoogleLinks: await prisma.pendingGoogleLink.count({ where: { teacherId } }),
    pendingRegistrations: await prisma.pendingRegistration.count({ where: { email } }),
  }
}

beforeAll(async () => {
  prisma = await createTestPrisma()
  teachers = makeTeacherRepository(prisma)
  pending = makePendingRegistrationRepository(prisma)
  refreshTokens = makeRefreshTokenRepository(prisma)
})

beforeEach(async () => {
  await truncateAll(prisma)
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('teacherRepository.deleteAccount', () => {
  it('удаляет учителя и всё его: refresh-токены, сбросы, привязки Google и регистрации этого email', async () => {
    const teacher = await teacherWithEverything(EMAIL)

    expect(await teachers.deleteAccount(teacher.id, EMAIL)).toBe(true)

    expect(await countsFor(teacher.id, EMAIL)).toEqual({
      teachers: 0,
      refreshTokens: 0,
      passwordResets: 0,
      pendingGoogleLinks: 0,
      pendingRegistrations: 0,
    })
  })

  it('чужие данные не трогает: другой учитель, его сессии и регистрации другого email на месте', async () => {
    const teacher = await teacherWithEverything(EMAIL)
    const other = await teacherWithEverything(OTHER_EMAIL)

    await teachers.deleteAccount(teacher.id, EMAIL)

    expect(await countsFor(other.id, OTHER_EMAIL)).toEqual({
      teachers: 1,
      refreshTokens: 1,
      passwordResets: 1,
      pendingGoogleLinks: 1,
      pendingRegistrations: 1,
    })
  })

  // Очередь по email проверяется напрямую: пока другая транзакция держит блокировку этого email (подтверждение
  // регистрации, вход через Google, привязка), удаление ждёт. Без этого исход гонок зависел бы только от построчных блокировок
  it('удаление ждёт блокировку email, которую держит другая транзакция', async () => {
    const teacher = await prisma.teacher.create({ data: { email: EMAIL, passwordHash: ARGON2ID_HASH, emailVerifiedAt: new Date() } })
    let releaseLock = () => {}
    const lockHeld = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    let lockTaken = () => {}
    const lockReady = new Promise<void>((resolve) => {
      lockTaken = resolve
    })
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${EMAIL}, 0))`
        lockTaken()
        await lockHeld
      },
      { timeout: 10_000 },
    )
    await lockReady

    let finished = false
    const deletion = teachers.deleteAccount(teacher.id, EMAIL).then((result) => {
      finished = true
      return result
    })
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_PROBE_MS))

    expect(finished).toBe(false)
    expect(await prisma.teacher.count({ where: { id: teacher.id } })).toBe(1)
    releaseLock()
    await holder
    expect(await deletion).toBe(true)
  })

  it('блокировка другого email удаление не задерживает', async () => {
    const teacher = await prisma.teacher.create({ data: { email: EMAIL, passwordHash: ARGON2ID_HASH, emailVerifiedAt: new Date() } })
    let releaseLock = () => {}
    const lockHeld = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    let lockTaken = () => {}
    const lockReady = new Promise<void>((resolve) => {
      lockTaken = resolve
    })
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${OTHER_EMAIL}, 0))`
        lockTaken()
        await lockHeld
      },
      { timeout: 10_000 },
    )
    await lockReady

    expect(await teachers.deleteAccount(teacher.id, EMAIL)).toBe(true)
    releaseLock()
    await holder
  })

  it('учителя уже нет — false', async () => {
    expect(await teachers.deleteAccount(randomUUID(), EMAIL)).toBe(false)
  })

  it('гонка двух удалений — ровно одно true', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      await truncateAll(prisma)
      const teacher = await teacherWithEverything(EMAIL)

      const results = await Promise.all([teachers.deleteAccount(teacher.id, EMAIL), teachers.deleteAccount(teacher.id, EMAIL)])

      expect(results.sort()).toEqual([false, true])
    }
  })

  // Без общей очереди по email подтверждение могло бы создать учителя с паролем ожидающей регистрации сразу
  // после удаления — аккаунт «воскрес» бы с чужим паролем
  it('гонка удаления и подтверждения регистрации того же email: без ошибок, ни учителя, ни регистраций не остаётся', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      await truncateAll(prisma)
      const teacher = await prisma.teacher.create({ data: { email: EMAIL, passwordHash: ARGON2ID_HASH, emailVerifiedAt: new Date() } })
      const tokenHash = newTokenHash()
      await pending.create({ email: EMAIL, passwordHash: `${ARGON2ID_HASH}-attacker`, displayName: null, tokenHash, expiresAt: fromNow(days(1)) })
      const registration = await pending.findByTokenHash(tokenHash)
      if (registration === null) throw new Error('registration not found')

      const [deleted, activation] = await Promise.all([
        teachers.deleteAccount(teacher.id, EMAIL),
        pending.activate(registration, tokenHash, new Date()),
      ])

      expect(deleted).toBe(true)
      expect(['alreadyUsed', 'emailTaken']).toContain(activation.status)
      expect(await prisma.teacher.count({ where: { email: EMAIL } })).toBe(0)
      expect(await prisma.pendingRegistration.count({ where: { email: EMAIL } })).toBe(0)
    }
  })

  // Удаление берёт блокировки токенов до строки учителя, как rotate: без этого PostgreSQL прерывал одну
  // из транзакций (P2034), и запрос получал 500
  it('гонка удаления и ротации refresh-токена: без исключений, учителя и его токенов не остаётся', async () => {
    for (let attempt = 0; attempt < ROTATE_RACE_ATTEMPTS; attempt++) {
      await truncateAll(prisma)
      const teacher = await prisma.teacher.create({ data: { email: EMAIL, passwordHash: ARGON2ID_HASH, emailVerifiedAt: new Date() } })
      const familyId = randomUUID()
      const old = await prisma.refreshToken.create({
        data: { teacherId: teacher.id, familyId, familyExpiresAt: fromNow(days(30)), tokenHash: newTokenHash(), expiresAt: fromNow(days(14)) },
      })
      const successor = { teacherId: teacher.id, familyId, familyExpiresAt: old.familyExpiresAt, tokenHash: newTokenHash(), expiresAt: fromNow(days(14)) }

      const [deleted, rotated] = await Promise.all([
        teachers.deleteAccount(teacher.id, EMAIL),
        refreshTokens.rotate(old.id, successor, new Date()),
      ])

      expect(deleted).toBe(true)
      expect(['rotated', 'alreadyUsed', 'teacherGone', 'conflict']).toContain(rotated)
      expect(await prisma.teacher.count({ where: { id: teacher.id } })).toBe(0)
      expect(await prisma.refreshToken.count({ where: { teacherId: teacher.id } })).toBe(0)
    }
  })
})

// Взаимоблокировку больше не прячут ни повтор в deleteAccount, ни 'conflict' в rotate: считаем транзакции удаления
// (больше одной на попытку — был повтор) и требуем от rotate только «чистые» исходы
describe('гонки с удалением аккаунта без взаимоблокировок (P2034)', () => {
  // Без взаимоблокировки исход 1 из 50 попыток (≈2%) на старом коде: серия из 200 ловит её почти всегда
  const DEADLOCK_RACE_ATTEMPTS = 200
  // Здесь взаимоблокировка — больше чем в половине пар, и каждая ждёт deadlock_timeout (1 с): хватит 40
  const EVICTION_RACE_ATTEMPTS = 40
  const RACE_TIMEOUT_MS = 120_000

  function countingTransactions() {
    const counter = { transactions: 0 }
    const client = new Proxy(prisma, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver)
        if (typeof value !== 'function') return value
        if (property !== '$transaction') return value.bind(target)
        return (...args: unknown[]) => {
          counter.transactions++
          return value.apply(target, args)
        }
      },
    })
    return { teachers: makeTeacherRepository(client), counter }
  }

  async function teacherWithFamilies(count: number) {
    const teacher = await prisma.teacher.create({ data: { email: `qa-${randomUUID()}@example.test`, passwordHash: ARGON2ID_HASH } })
    const families = []
    for (let index = 0; index < count; index++) {
      families.push(
        await prisma.refreshToken.create({
          data: { teacherId: teacher.id, familyId: randomUUID(), familyExpiresAt: fromNow(days(30)), tokenHash: newTokenHash(), expiresAt: fromNow(days(14)) },
        }),
      )
    }
    return { teacher, families }
  }

  function newFamilyFor(teacherId: string, familyId: string = randomUUID()) {
    return { teacherId, familyId, familyExpiresAt: fromNow(days(30)), tokenHash: newTokenHash(), expiresAt: fromNow(days(14)) }
  }

  it(`rotate ↔ deleteAccount, ${DEADLOCK_RACE_ATTEMPTS} пар в обоих порядках: без исключений, без повтора, rotate — rotated или alreadyUsed`, async () => {
    const { teachers: counted, counter } = countingTransactions()
    const outcomes = new Set<string>()
    for (let attempt = 0; attempt < DEADLOCK_RACE_ATTEMPTS; attempt++) {
      const { teacher, families } = await teacherWithFamilies(1)
      const old = families[0]
      if (old === undefined) throw new Error('no token')
      const rotate = () => refreshTokens.rotate(old.id, newFamilyFor(teacher.id, old.familyId), new Date())
      const remove = () => counted.deleteAccount(teacher.id, teacher.email)
      counter.transactions = 0

      const [rotated, deleted] =
        attempt % 2 === 0 ? await Promise.all([rotate(), remove()]) : (await Promise.all([remove(), rotate()])).reverse()

      outcomes.add(String(rotated))
      expect(deleted).toBe(true)
      expect(counter.transactions).toBe(1)
      expect(await prisma.refreshToken.count({ where: { teacherId: teacher.id } })).toBe(0)
    }
    expect([...outcomes].filter((outcome) => outcome !== 'rotated' && outcome !== 'alreadyUsed')).toEqual([])
  }, RACE_TIMEOUT_MS)

  // Вход учителя, у которого уже MAX_ACTIVE_SESSIONS семей: createFamily вытесняет старую семью, удаляя её токены
  it(`createFamily с вытеснением старой семьи ↔ deleteAccount, ${EVICTION_RACE_ATTEMPTS} пар: без исключений и без повтора`, async () => {
    const { teachers: counted, counter } = countingTransactions()
    const failures = new Map<string, number>()
    for (let attempt = 0; attempt < EVICTION_RACE_ATTEMPTS; attempt++) {
      const { teacher } = await teacherWithFamilies(MAX_ACTIVE_SESSIONS)
      const create = () => refreshTokens.createFamily(newFamilyFor(teacher.id), MAX_ACTIVE_SESSIONS)
      const remove = () => counted.deleteAccount(teacher.id, teacher.email)
      counter.transactions = 0

      const settled = await Promise.allSettled(attempt % 2 === 0 ? [create(), remove()] : [remove(), create()])
      const results = attempt % 2 === 0 ? { createFamily: settled[0], deleteAccount: settled[1] } : { createFamily: settled[1], deleteAccount: settled[0] }

      for (const [operation, result] of Object.entries(results)) {
        if (result?.status !== 'rejected') continue
        const key = `${operation}: ${(result.reason as { code?: string; name?: string }).code ?? (result.reason as Error).name}`
        failures.set(key, (failures.get(key) ?? 0) + 1)
      }
      if (counter.transactions > 1) failures.set('deleteAccount retry', (failures.get('deleteAccount retry') ?? 0) + 1)
      expect(await prisma.teacher.count({ where: { id: teacher.id } })).toBe(0)
      expect(await prisma.refreshToken.count({ where: { teacherId: teacher.id } })).toBe(0)
    }
    expect(Object.fromEntries(failures)).toEqual({})
  }, RACE_TIMEOUT_MS)
})
