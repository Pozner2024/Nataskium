import { loginSchema, registerSchema } from '@nataskium/shared/schemas'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeGetMe,
  makeLogin,
  makeLogoutAll,
  makePasswordHasher,
  makePendingRegistrationRepository,
  makeRefreshSession,
  makeRefreshTokenRepository,
  makeRegister,
  makeTeacherRepository,
  makeTokenService,
  makeVerifyEmail,
} from '../../src/features/auth'
import type { AuthSession, PasswordHasher } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { type CallLog, flushBackground, makeFakeLimiter, makeFakeQuota } from '../fakes/authFakes'
import { makeRecordingEmailSender } from '../fakes/recordingEmailSender'
import { createTestPrisma, truncateAll } from './testDatabase'

// Настоящие репозитории, hasher и tokenService на db-test; почта, бюджет писем и лимит неудач — в памяти
const PASSWORD = 'qa-correct-horse-1957'
const SESSION_INVALID = { status: 401, message: 'Session is invalid or expired, sign in again' }
const PARALLEL_ATTEMPTS = 10

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

let prisma: PrismaClient
let hasher: PasswordHasher

function makeAuth() {
  const calls: CallLog = []
  const email = makeRecordingEmailSender()
  const deps = {
    teachers: makeTeacherRepository(prisma),
    pendingRegistrations: makePendingRegistrationRepository(prisma),
    refreshTokens: makeRefreshTokenRepository(prisma),
    hasher,
    tokens,
    failureLimiter: makeFakeLimiter(calls).limiter,
    now: () => new Date(),
  }
  return {
    email,
    register: makeRegister({ ...deps, emailSender: email.sender, registrationEmailQuota: makeFakeQuota(calls).quota }),
    verifyEmail: makeVerifyEmail(deps),
    login: makeLogin(deps),
    refresh: makeRefreshSession(deps),
    logoutAll: makeLogoutAll(deps),
    getMe: makeGetMe(deps),
  }
}

// Регистрация и подтверждение: первая сессия учителя
async function signUp(auth: ReturnType<typeof makeAuth>, address: string): Promise<AuthSession> {
  await auth.register(registerSchema.parse({ email: address, password: PASSWORD, displayName: 'Анна' }))
  await flushBackground()
  const verification = auth.email.sent.filter((sent) => sent.kind === 'verification').at(-1)
  if (verification?.kind !== 'verification') throw new Error('no verification email')
  return auth.verifyEmail({ token: verification.rawToken, password: PASSWORD })
}

async function rowsOfFamily(refreshToken: string) {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: tokens.hashOpaqueToken(refreshToken) } })
  if (row === null) return 0
  return prisma.refreshToken.count({ where: { familyId: row.familyId } })
}

beforeAll(async () => {
  prisma = await createTestPrisma()
  hasher = await makePasswordHasher()
})

beforeEach(async () => {
  await truncateAll(prisma)
  // Повторное использование пишется в warn: в этих тестах оно ожидаемо
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('жизненный цикл сессии на настоящей базе', () => {
  it('register → verifyEmail → refresh → refresh: семья одна, старые токены отозваны', async () => {
    const auth = makeAuth()
    const first = await signUp(auth, 'qa-anna@example.test')

    const second = await auth.refresh(first.refreshToken)
    const third = await auth.refresh(second.refreshToken)

    expect(await tokens.verifyAccessToken(third.accessToken)).toEqual({ teacherId: first.teacher.id })
    const rows = await prisma.refreshToken.findMany({ where: { teacherId: first.teacher.id } })
    expect(new Set(rows.map((row) => row.familyId)).size).toBe(1)
    expect(rows.filter((row) => row.revokedAt !== null)).toHaveLength(2)
    expect(rows.filter((row) => row.revokedAt === null).map((row) => row.tokenHash)).toEqual([tokens.hashOpaqueToken(third.refreshToken)])
    expect(rows.every((row) => row.familyExpiresAt.getTime() === rows[0]?.familyExpiresAt.getTime())).toBe(true)
  })

  it('старый токен второй раз — семья удалена, новый токен тоже не работает', async () => {
    const auth = makeAuth()
    const first = await signUp(auth, 'qa-anna@example.test')
    const second = await auth.refresh(first.refreshToken)

    await expect(auth.refresh(first.refreshToken)).rejects.toMatchObject(SESSION_INVALID)

    await expect(auth.refresh(second.refreshToken)).rejects.toMatchObject(SESSION_INVALID)
    expect(await prisma.refreshToken.count({ where: { teacherId: first.teacher.id } })).toBe(0)
  })

  it('повторное использование удаляет только ту семью, другой вход учителя жив', async () => {
    const auth = makeAuth()
    const first = await signUp(auth, 'qa-anna@example.test')
    const otherDevice = await auth.login(loginSchema.parse({ email: 'qa-anna@example.test', password: PASSWORD }))
    await auth.refresh(first.refreshToken)

    await expect(auth.refresh(first.refreshToken)).rejects.toMatchObject(SESSION_INVALID)

    expect(await rowsOfFamily(otherDevice.refreshToken)).toBe(1)
    await expect(auth.refresh(otherDevice.refreshToken)).resolves.toMatchObject({ teacher: { id: first.teacher.id } })
  })

  it('гонка: два refresh одним токеном — один успех, затем семья удалена', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      await truncateAll(prisma)
      const auth = makeAuth()
      const session = await signUp(auth, `qa-race-${attempt}@example.test`)

      const results = await Promise.allSettled([auth.refresh(session.refreshToken), auth.refresh(session.refreshToken)])

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find((result) => result.status === 'rejected')
      expect(rejected?.status === 'rejected' ? rejected.reason : null).toMatchObject(SESSION_INVALID)
      expect(await prisma.refreshToken.count({ where: { teacherId: session.teacher.id } })).toBe(0)
    }
  })

  it('login с паролем регистрации — новая семья; неверный пароль — 401', async () => {
    const auth = makeAuth()
    const first = await signUp(auth, 'qa-anna@example.test')

    const session = await auth.login(loginSchema.parse({ email: ' QA-Anna@Example.TEST ', password: PASSWORD }))
    await expect(auth.login(loginSchema.parse({ email: 'qa-anna@example.test', password: 'qa-wrong' }))).rejects.toMatchObject({
      status: 401,
      message: 'Wrong email or password',
    })

    expect(session.teacher.id).toBe(first.teacher.id)
    const families = await prisma.refreshToken.findMany({ where: { teacherId: first.teacher.id }, select: { familyId: true } })
    expect(new Set(families.map((row) => row.familyId)).size).toBe(2)
  })

  it('logoutAll удаляет все сессии учителя, чужие остаются; getMe после удаления учителя — 401', async () => {
    const auth = makeAuth()
    const anna = await signUp(auth, 'qa-anna@example.test')
    const annaPhone = await auth.login(loginSchema.parse({ email: 'qa-anna@example.test', password: PASSWORD }))
    const boris = await signUp(auth, 'qa-boris@example.test')

    await auth.logoutAll(anna.teacher.id)

    await expect(auth.refresh(anna.refreshToken)).rejects.toMatchObject(SESSION_INVALID)
    await expect(auth.refresh(annaPhone.refreshToken)).rejects.toMatchObject(SESSION_INVALID)
    await expect(auth.refresh(boris.refreshToken)).resolves.toMatchObject({ teacher: { id: boris.teacher.id } })
    expect(await auth.getMe(anna.teacher.id)).toMatchObject({ id: anna.teacher.id, hasPassword: true })

    await prisma.teacher.delete({ where: { id: anna.teacher.id } })
    await expect(auth.getMe(anna.teacher.id)).rejects.toMatchObject(SESSION_INVALID)
  })
})
