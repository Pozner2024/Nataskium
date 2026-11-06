import { registerSchema, verifyEmailSchema } from '@nataskium/shared/schemas'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  makePasswordHasher,
  makePendingRegistrationRepository,
  makeRefreshTokenRepository,
  makeRegister,
  makeTeacherRepository,
  makeTokenService,
  makeVerifyEmail,
} from '../../src/features/auth'
import type { PasswordHasher } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { AppError } from '../../src/shared/errors'
import { type CallLog, flushBackground, makeFakeLimiter, makeFakeQuota } from '../fakes/authFakes'
import { makeRecordingEmailSender } from '../fakes/recordingEmailSender'
import { createTestPrisma, truncateAll } from './testDatabase'

// Настоящие репозитории, hasher и tokenService на db-test; в памяти только почта, бюджет писем и лимит неудач
const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const OTHER_PASSWORD = 'qa-second-attempt-2024'
const PARALLEL_ATTEMPTS = 10

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

let prisma: PrismaClient
let hasher: PasswordHasher

function makeFlow() {
  const calls: CallLog = []
  const email = makeRecordingEmailSender()
  const limiter = makeFakeLimiter(calls)
  const deps = {
    teachers: makeTeacherRepository(prisma),
    pendingRegistrations: makePendingRegistrationRepository(prisma),
    refreshTokens: makeRefreshTokenRepository(prisma),
    hasher,
    tokens,
    now: () => new Date(),
  }
  const register = makeRegister({ ...deps, emailSender: email.sender, registrationEmailQuota: makeFakeQuota(calls).quota })
  const verifyEmail = makeVerifyEmail({ ...deps, failureLimiter: limiter.limiter })
  return { register, verifyEmail, email, limiter }
}

function lastVerificationToken(sent: ReturnType<typeof makeRecordingEmailSender>['sent']): string {
  const verification = sent.filter((email) => email.kind === 'verification').at(-1)
  if (verification?.kind !== 'verification') throw new Error('no verification email')
  return verification.rawToken
}

beforeAll(async () => {
  prisma = await createTestPrisma()
  hasher = await makePasswordHasher()
})

beforeEach(async () => {
  await truncateAll(prisma)
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('register → verifyEmail на настоящей базе', () => {
  it('создаёт учителя с именем, одну семью токенов и удаляет все записи email', async () => {
    const flow = makeFlow()
    await flow.register(registerSchema.parse({ email: ' Qa-Anna@Example.TEST ', password: OTHER_PASSWORD }))
    await flow.register(registerSchema.parse({ email: EMAIL, password: PASSWORD, displayName: '  Анна ' }))
    await flushBackground()
    expect(await prisma.pendingRegistration.count({ where: { email: EMAIL } })).toBe(2)

    const session = await flow.verifyEmail(
      verifyEmailSchema.parse({ token: lastVerificationToken(flow.email.sent), password: PASSWORD }),
    )

    const teacher = await prisma.teacher.findUnique({ where: { email: EMAIL } })
    expect(teacher).toMatchObject({ id: session.teacher.id, displayName: 'Анна', googleId: null })
    expect(teacher?.emailVerifiedAt).toBeInstanceOf(Date)
    expect(await hasher.verify(teacher?.passwordHash ?? null, PASSWORD)).toBe(true)
    expect(await prisma.pendingRegistration.count({ where: { email: EMAIL } })).toBe(0)

    const refreshRows = await prisma.refreshToken.findMany({ where: { teacherId: session.teacher.id } })
    expect(refreshRows).toHaveLength(1)
    expect(refreshRows[0]?.tokenHash).toBe(tokens.hashOpaqueToken(session.refreshToken))
    expect(await tokens.verifyAccessToken(session.accessToken)).toEqual({ teacherId: session.teacher.id })
  })

  it('в базе нет сырого токена из письма и пароля', async () => {
    const flow = makeFlow()
    await flow.register(registerSchema.parse({ email: EMAIL, password: PASSWORD }))
    await flushBackground()

    const rows = JSON.stringify(await prisma.pendingRegistration.findMany())
    expect(rows).not.toContain(lastVerificationToken(flow.email.sent))
    expect(rows).not.toContain(PASSWORD)
  })

  it('ссылка другой регистрации того же email с чужим паролем не активирует аккаунт', async () => {
    const flow = makeFlow()
    await flow.register(registerSchema.parse({ email: EMAIL, password: PASSWORD }))
    await flushBackground()

    await expect(
      flow.verifyEmail({ token: lastVerificationToken(flow.email.sent), password: OTHER_PASSWORD }),
    ).rejects.toMatchObject({ status: 400 })
    expect(await prisma.teacher.count()).toBe(0)
    expect(flow.limiter.state.failures).toBe(1)
  })

  it('повторная регистрация уже подтверждённого email — письмо accountExists, записи нет', async () => {
    const flow = makeFlow()
    await flow.register(registerSchema.parse({ email: EMAIL, password: PASSWORD }))
    await flushBackground()
    await flow.verifyEmail({ token: lastVerificationToken(flow.email.sent), password: PASSWORD })

    await flow.register(registerSchema.parse({ email: EMAIL, password: OTHER_PASSWORD }))
    await flushBackground()

    expect(flow.email.sent.at(-1)).toEqual({ kind: 'accountExists', to: EMAIL, displayName: null })
    expect(await prisma.pendingRegistration.count()).toBe(0)
  })

  it('гонка: два verifyEmail одним токеном — одна сессия, второй получает 400', async () => {
    for (let attempt = 0; attempt < PARALLEL_ATTEMPTS; attempt++) {
      await truncateAll(prisma)
      const flow = makeFlow()
      await flow.register(registerSchema.parse({ email: EMAIL, password: PASSWORD }))
      await flushBackground()
      const input = { token: lastVerificationToken(flow.email.sent), password: PASSWORD }

      const results = await Promise.allSettled([flow.verifyEmail(input), flow.verifyEmail(input)])

      const fulfilled = results.filter((result) => result.status === 'fulfilled')
      const rejected = results.filter((result) => result.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected[0]?.reason).toBeInstanceOf(AppError)
      expect(rejected[0]?.reason).toMatchObject({ status: 400 })
      expect(await prisma.teacher.count()).toBe(1)
      expect(await prisma.refreshToken.count()).toBe(1)
      // Оба знали верный пароль: ни одна попытка не засчитана как неудачная
      expect(flow.limiter.state.failures).toBe(0)
    }
  })
})
