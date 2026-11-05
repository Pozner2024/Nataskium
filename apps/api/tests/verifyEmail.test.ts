import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_ACTIVE_SESSIONS, makeTokenService, makeVerifyEmail } from '../src/features/auth'
import { AppError, RateLimitedError, ServiceBusyError } from '../src/shared/errors'
import {
  type CallLog,
  makeFakeHasher,
  makeFakeLimiter,
  makeFakePendingRegistrations,
  makeFakeRefreshTokens,
} from './fakes/authFakes'

const NOW = new Date('2026-11-05T12:00:00Z')
const MS_PER_DAY = 24 * 60 * 60 * 1000
const REFRESH_TTL_MS = 14 * MS_PER_DAY
const SESSION_TTL_MS = 30 * MS_PER_DAY
// Решение пользователя: не больше 5 активных сессий на учителя
const EXPECTED_MAX_SESSIONS = 5
const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const INVALID_MESSAGE = 'The link is invalid or expired, or the password is wrong'
const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists, sign in instead'
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

let calls: CallLog

async function setup(options: { expiresAt?: Date; displayName?: string | null } = {}) {
  const fakeHasher = makeFakeHasher(calls)
  const limiter = makeFakeLimiter(calls)
  const pending = makeFakePendingRegistrations(calls)
  const refresh = makeFakeRefreshTokens(calls)
  const rawToken = tokens.generateOpaqueToken()
  await pending.repository.create({
    email: EMAIL,
    passwordHash: fakeHasher.hashOf(PASSWORD),
    displayName: options.displayName === undefined ? 'Анна' : options.displayName,
    tokenHash: tokens.hashOpaqueToken(rawToken),
    expiresAt: options.expiresAt ?? new Date(NOW.getTime() + MS_PER_DAY),
  })
  calls.length = 0

  const verifyEmail = makeVerifyEmail({
    pendingRegistrations: pending.repository,
    refreshTokens: refresh.repository,
    hasher: fakeHasher.hasher,
    tokens,
    failureLimiter: limiter.limiter,
    now: () => NOW,
  })
  return { verifyEmail, rawToken, hasher: fakeHasher, limiter, pending, refresh }
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

function expectInvalid(error: unknown) {
  expect(error).toBeInstanceOf(AppError)
  expect(error).toMatchObject({ status: 400, message: INVALID_MESSAGE })
}

beforeEach(() => {
  calls = []
})

describe('verifyEmail: нет записи или срок истёк', () => {
  it.each([
    ['неизвестный токен', {}, () => tokens.generateOpaqueToken()],
    ['срок истёк', { expiresAt: new Date(NOW.getTime() - 1) }, null],
    ['срок ровно сейчас', { expiresAt: NOW }, null],
  ])('%s: сверка с dummy-хэшем и тот же 400, лимит не тратится', async (_name, options, makeToken) => {
    const { verifyEmail, rawToken, limiter } = await setup(options)

    const error = await rejectionOf(verifyEmail({ token: makeToken?.() ?? rawToken, password: PASSWORD }))

    expectInvalid(error)
    expect(calls).toEqual(['pending.findByTokenHash', 'hasher.verify(dummy)'])
    expect(limiter.state.reservations).toBe(0)
  })
})

describe('verifyEmail: перегрузка и лимит', () => {
  it('очередь хэширования заполнена — 503 до резерва, лимит не тратится', async () => {
    const { verifyEmail, rawToken, hasher, limiter } = await setup()
    hasher.state.busy = true

    const error = await rejectionOf(verifyEmail({ token: rawToken, password: PASSWORD }))

    expect(error).toBeInstanceOf(ServiceBusyError)
    expect(calls).toEqual(['pending.findByTokenHash', 'hasher.assertCapacity'])
    expect(limiter.state.reservations).toBe(0)
  })

  it('очередь заполнилась во время сверки — 503, резерв снят', async () => {
    const { verifyEmail, rawToken, hasher, limiter } = await setup()
    hasher.state.busyOnVerify = true

    const error = await rejectionOf(verifyEmail({ token: rawToken, password: PASSWORD }))

    expect(error).toBeInstanceOf(ServiceBusyError)
    expect(limiter.state.reservations).toBe(1)
    expect(limiter.state.failures).toBe(0)
    expect(calls).not.toContain('pending.activate')
  })

  it('лимит неудач исчерпан — 429 RateLimitedError без сверки пароля', async () => {
    const { verifyEmail, rawToken, limiter } = await setup()
    limiter.state.blocked = true

    const error = await rejectionOf(verifyEmail({ token: rawToken, password: PASSWORD }))

    expect(error).toBeInstanceOf(RateLimitedError)
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: limiter.retryAfterSeconds })
    expect(calls).not.toContain('hasher.verify')
    expect(calls).not.toContain('pending.activate')
  })

  it('лимит считается по email регистрации', async () => {
    const { verifyEmail, rawToken } = await setup()

    await verifyEmail({ token: rawToken, password: PASSWORD })

    expect(calls).toContain(`limiter.reserve:${EMAIL}`)
  })
})

describe('verifyEmail: пароль', () => {
  it('неверный пароль — тот же 400, неудача засчитана, активации нет', async () => {
    const { verifyEmail, rawToken, limiter, pending } = await setup()

    const error = await rejectionOf(verifyEmail({ token: rawToken, password: 'qa-wrong-password' }))

    expectInvalid(error)
    expect(limiter.state.failures).toBe(1)
    expect(calls).not.toContain('pending.activate')
    expect(pending.rows).toHaveLength(1)
  })

  it('верный пароль — резерв снят, шаги по порядку', async () => {
    const { verifyEmail, rawToken, limiter } = await setup()

    await verifyEmail({ token: rawToken, password: PASSWORD })

    expect(limiter.state.failures).toBe(0)
    expect(calls).toEqual([
      'pending.findByTokenHash',
      'hasher.assertCapacity',
      `limiter.reserve:${EMAIL}`,
      'hasher.verify',
      'limiter.release',
      'pending.activate',
      'refreshTokens.createFamily',
    ])
  })
})

describe('verifyEmail: результат активации', () => {
  it('alreadyUsed — тот же 400, сессии нет', async () => {
    const { verifyEmail, rawToken, pending, refresh } = await setup()
    pending.state.activation = 'alreadyUsed'

    expectInvalid(await rejectionOf(verifyEmail({ token: rawToken, password: PASSWORD })))
    expect(refresh.families).toEqual([])
  })

  it('emailTaken — 409, сессии нет', async () => {
    const { verifyEmail, rawToken, pending, refresh } = await setup()
    pending.state.activation = 'emailTaken'

    const error = await rejectionOf(verifyEmail({ token: rawToken, password: PASSWORD }))

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ status: 409, message: EMAIL_TAKEN_MESSAGE })
    expect(refresh.families).toEqual([])
  })

  it('все 400 неотличимы друг от друга', async () => {
    const unknown = await setup()
    const wrongPassword = await setup()
    const used = await setup()
    used.pending.state.activation = 'alreadyUsed'

    const errors = await Promise.all([
      rejectionOf(unknown.verifyEmail({ token: tokens.generateOpaqueToken(), password: PASSWORD })),
      rejectionOf(wrongPassword.verifyEmail({ token: wrongPassword.rawToken, password: 'qa-wrong' })),
      rejectionOf(used.verifyEmail({ token: used.rawToken, password: PASSWORD })),
    ])

    expect(new Set(errors.map((error) => JSON.stringify([(error as AppError).status, (error as AppError).message]))).size).toBe(1)
  })
})

describe('verifyEmail: сессия после подтверждения', () => {
  it('access-токен учителя, refresh из 43 символов, срок 14 дней', async () => {
    const { verifyEmail, rawToken } = await setup()

    const session = await verifyEmail({ token: rawToken, password: PASSWORD })

    expect(await tokens.verifyAccessToken(session.accessToken)).toEqual({ teacherId: session.teacher.id })
    expect(session.refreshToken).toMatch(BASE64URL_43)
    expect(session.refreshTokenExpiresAt).toEqual(new Date(NOW.getTime() + REFRESH_TTL_MS))
  })

  it('новая семья: в базе HMAC refresh-токена, абсолютный срок 30 дней, лимит семей', async () => {
    const { verifyEmail, rawToken, refresh } = await setup()

    const session = await verifyEmail({ token: rawToken, password: PASSWORD })

    expect(MAX_ACTIVE_SESSIONS).toBe(EXPECTED_MAX_SESSIONS)
    expect(refresh.families).toHaveLength(1)
    expect(refresh.families[0]).toEqual({
      maxFamilies: EXPECTED_MAX_SESSIONS,
      token: {
        teacherId: session.teacher.id,
        familyId: expect.any(String),
        familyExpiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
        tokenHash: tokens.hashOpaqueToken(session.refreshToken),
        expiresAt: session.refreshTokenExpiresAt,
      },
    })
    expect(JSON.stringify(refresh.families)).not.toContain(session.refreshToken)
  })

  it('teacher — только публичные поля, без хэша пароля', async () => {
    const { verifyEmail, rawToken } = await setup()

    const session = await verifyEmail({ token: rawToken, password: PASSWORD })

    expect(session.teacher).toEqual({
      id: expect.any(String),
      email: EMAIL,
      displayName: 'Анна',
      hasPassword: true,
      hasGoogle: false,
    })
    expect(JSON.stringify(session)).not.toContain('$argon2id$')
  })

  it('activate получает то же now, по которому проверялся срок', async () => {
    const { verifyEmail, rawToken, pending } = await setup()

    await verifyEmail({ token: rawToken, password: PASSWORD })

    expect(pending.state.activatedAt).toBe(NOW)
  })

  it('без имени — displayName null', async () => {
    const { verifyEmail, rawToken } = await setup({ displayName: null })

    expect((await verifyEmail({ token: rawToken, password: PASSWORD })).teacher.displayName).toBeNull()
  })
})
