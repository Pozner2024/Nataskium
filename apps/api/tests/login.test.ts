import { inspect } from 'node:util'
import { loginSchema } from '@nataskium/shared/schemas'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDeviceTrust, makeLogin, makeTokenService } from '../src/features/auth'
import type { TeacherAccount, TeacherRepository } from '../src/features/auth/types'
import { AppError, RateLimitedError, ServiceBusyError } from '../src/shared/errors'
import { type CallLog, makeFakeHasher, makeFakeLimiter, makeFakeTeachers, makeMemoryRefreshTokens } from './fakes/authFakes'

const NOW = new Date('2026-11-05T12:00:00Z')
const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const WRONG_PASSWORD = 'qa-wrong-password'
const INVALID_LOGIN = { status: 401, message: 'Wrong email or password' }
const FAILURES_BEFORE_LOCK = 10
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

const deviceTrust = makeDeviceTrust('qa-fake-hmac-secret-0123456789abcdef')
const FAKE_HASH_PREFIX = '$argon2id$fake$'
const PASSWORD_HASH = FAKE_HASH_PREFIX + PASSWORD
const NEW_PASSWORD_HASH = `${FAKE_HASH_PREFIX}qa-new-password`

let calls: CallLog

function teacher(overrides: Partial<TeacherAccount>, hashOf: (password: string) => string): TeacherAccount {
  return {
    id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
    email: EMAIL,
    displayName: 'Анна',
    passwordHash: hashOf(PASSWORD),
    googleId: null,
    emailVerifiedAt: NOW,
    ...overrides,
  }
}

function setup(options: { account?: Partial<TeacherAccount> | null; teachers?: TeacherRepository } = {}) {
  const hasher = makeFakeHasher(calls)
  const limiter = makeFakeLimiter(calls)
  const deviceLimiter = makeFakeLimiter(calls)
  const refresh = makeMemoryRefreshTokens(calls)
  const accounts = options.account === null ? [] : [teacher(options.account ?? {}, hasher.hashOf)]
  const login = makeLogin({
    teachers: options.teachers ?? makeFakeTeachers(calls, accounts).teachers,
    hasher: hasher.hasher,
    failureLimiter: limiter.limiter,
    deviceTrust,
    deviceFailureLimiter: deviceLimiter.limiter,
    refreshTokens: refresh.repository,
    tokens,
    now: () => NOW,
  })
  return { login, hasher, limiter, deviceLimiter, refresh }
}

function input(password = PASSWORD) {
  return loginSchema.parse({ email: EMAIL, password })
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('login: перегрузка и лимит', () => {
  it('очередь хэширования заполнена — 503 до резерва, лимит не тратится', async () => {
    const { login, hasher, limiter } = setup()
    hasher.state.busy = true

    expect(await rejectionOf(login(input()))).toBeInstanceOf(ServiceBusyError)
    expect(calls).toEqual(['hasher.assertCapacity'])
    expect(limiter.state.reservations).toBe(0)
  })

  it('лимит исчерпан — 429 без сверки', async () => {
    const { login, limiter } = setup()
    limiter.state.blocked = true

    const error = await rejectionOf(login(input()))

    expect(error).toBeInstanceOf(RateLimitedError)
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: limiter.retryAfterSeconds })
    expect(calls).toEqual(['hasher.assertCapacity', 'teachers.findByEmail', `limiter.reserve:${EMAIL}`])
  })

  it(`после ${FAILURES_BEFORE_LOCK} неудач — 429, даже с верным паролем`, async () => {
    const { login, limiter } = setup()
    limiter.state.maxFailures = FAILURES_BEFORE_LOCK

    for (let attempt = 0; attempt < FAILURES_BEFORE_LOCK; attempt++) {
      expect(await rejectionOf(login(input(WRONG_PASSWORD)))).toMatchObject(INVALID_LOGIN)
    }

    expect(await rejectionOf(login(input()))).toBeInstanceOf(RateLimitedError)
    expect(limiter.state.failures).toBe(FAILURES_BEFORE_LOCK)
  })
})

describe('login: отказ', () => {
  it.each([
    ['учителя нет', null, 'hasher.verify(dummy)', PASSWORD],
    ['вход только через Google', { passwordHash: null, googleId: 'google-sub-1' }, 'hasher.verify(dummy)', PASSWORD],
    ['email не подтверждён', { emailVerifiedAt: null }, 'hasher.verify', PASSWORD],
    ['неверный пароль', {}, 'hasher.verify', WRONG_PASSWORD],
  ])('%s — 401 Wrong email or password, сверка выполнена, неудача засчитана', async (_name, account, verifyCall, password) => {
    const { login, limiter, refresh } = setup({ account })

    const error = await rejectionOf(login(input(password)))

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject(INVALID_LOGIN)
    expect(calls).toEqual(['hasher.assertCapacity', 'teachers.findByEmail', `limiter.reserve:${EMAIL}`, verifyCall])
    expect(limiter.state.failures).toBe(1)
    expect(refresh.rows).toEqual([])
  })

  it('все отказы неотличимы', async () => {
    const errors = await Promise.all([
      rejectionOf(setup({ account: null }).login(input())),
      rejectionOf(setup({ account: { passwordHash: null } }).login(input())),
      rejectionOf(setup({ account: { emailVerifiedAt: null } }).login(input())),
      rejectionOf(setup().login(input(WRONG_PASSWORD))),
    ])

    expect(new Set(errors.map((error) => JSON.stringify([(error as AppError).status, (error as AppError).message]))).size).toBe(1)
  })

  it('сбой базы — ошибка наружу, резерв снят', async () => {
    const failing: TeacherRepository = {
      findByEmail: async () => {
        throw new Error('connection refused')
      },
      findById: async () => null,
      signInWithGoogle: async () => ({ status: 'conflict' }),
      deleteAccount: async () => false,
      changePassword: async () => false,
    }
    const { login, limiter } = setup({ teachers: failing })

    expect(await rejectionOf(login(input()))).toMatchObject({ message: 'connection refused' })
    expect(limiter.state.failures).toBe(0)
  })

  it('503 во время сверки — резерв снят', async () => {
    const { login, hasher, limiter } = setup()
    hasher.state.busyOnVerify = true

    expect(await rejectionOf(login(input()))).toBeInstanceOf(ServiceBusyError)
    expect(limiter.state.failures).toBe(0)
  })
})

describe('login: успех', () => {
  it('резерв снят, выдана сессия', async () => {
    const { login, limiter, refresh } = setup()

    const session = await login(input())

    expect(limiter.state.failures).toBe(0)
    expect(calls).toContain('limiter.release')
    expect(await tokens.verifyAccessToken(session.accessToken)).toEqual({ teacherId: session.teacher.id })
    expect(session.refreshToken).toMatch(BASE64URL_43)
    expect(refresh.rows).toHaveLength(1)
    expect(refresh.rows[0]?.tokenHash).toBe(tokens.hashOpaqueToken(session.refreshToken))
    expect(session.teacher).toEqual({
      id: expect.any(String),
      email: EMAIL,
      displayName: 'Анна',
      hasPassword: true,
      hasGoogle: false,
    })
  })

  it('в логе нет email и пароля ни при успехе, ни при отказе', async () => {
    const logged: unknown[] = []
    for (const method of ['error', 'warn', 'info', 'log', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args)
      })
    }

    await setup().login(input())
    await rejectionOf(setup().login(input(WRONG_PASSWORD)))
    await rejectionOf(setup({ account: null }).login(input()))

    const text = inspect(logged, { depth: null })
    expect(text).not.toContain(EMAIL)
    expect(text).not.toContain(PASSWORD)
    expect(text).not.toContain(WRONG_PASSWORD)
  })
})

describe('login: учителя удалили во время сверки пароля', () => {
  it('createFamily → false — 401 «сессия недействительна», сессии нет, неудача не засчитана', async () => {
    const { login, refresh, limiter } = setup()
    refresh.state.teacherGone = true

    const error = await rejectionOf(login(input()))

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ status: 401, message: 'Session is invalid or expired, sign in again' })
    expect(refresh.rows).toEqual([])
    expect(limiter.state.failures).toBe(0)
  })
})

describe('login: знакомое устройство', () => {
  const deviceToken = () => deviceTrust.issue(EMAIL, PASSWORD_HASH)

  it('валидная cookie: резерв берётся по устройству, счётчик email не трогается', async () => {
    const { login, limiter, deviceLimiter } = setup()
    const token = deviceToken()
    const nonce = deviceTrust.verify(EMAIL, PASSWORD_HASH, token)

    expect(await rejectionOf(login(input(WRONG_PASSWORD), token))).toMatchObject(INVALID_LOGIN)

    expect(calls).toContain(`limiter.reserve:${nonce}`)
    expect(calls).not.toContain(`limiter.reserve:${EMAIL}`)
    expect(limiter.state.reservations).toBe(0)
    expect(deviceLimiter.state.failures).toBe(1)
  })

  it('email заблокирован чужими неудачами — без cookie 429, с валидной cookie вход проходит', async () => {
    const { login, limiter } = setup()
    limiter.state.maxFailures = FAILURES_BEFORE_LOCK
    for (let attempt = 0; attempt < FAILURES_BEFORE_LOCK; attempt++) await rejectionOf(login(input(WRONG_PASSWORD)))

    expect(await rejectionOf(login(input()))).toBeInstanceOf(RateLimitedError)
    const session = await login(input(), deviceToken())

    expect(session.teacher.email).toBe(EMAIL)
  })

  it(`${FAILURES_BEFORE_LOCK} неудач с cookie блокируют устройство, но не канал email`, async () => {
    const { login, limiter, deviceLimiter } = setup()
    deviceLimiter.state.maxFailures = FAILURES_BEFORE_LOCK
    const token = deviceToken()
    for (let attempt = 0; attempt < FAILURES_BEFORE_LOCK; attempt++) await rejectionOf(login(input(WRONG_PASSWORD), token))

    expect(await rejectionOf(login(input(), token))).toBeInstanceOf(RateLimitedError)
    expect(limiter.state.failures).toBe(0)
    expect(await login(input())).toMatchObject({ teacher: { email: EMAIL } })
  })

  it('чужая и испорченная cookie — как без неё', async () => {
    const { login, limiter } = setup()
    const foreign = deviceTrust.issue('qa-other@example.test', PASSWORD_HASH)

    await rejectionOf(login(input(WRONG_PASSWORD), foreign))
    await rejectionOf(login(input(WRONG_PASSWORD), 'garbage'))

    expect(limiter.state.failures).toBe(2)
  })

  it('успех возвращает токен устройства, валидный для этого email', async () => {
    const { login } = setup()

    const session = await login(input())

    expect(deviceTrust.verify(EMAIL, PASSWORD_HASH, session.deviceToken)).not.toBeNull()
    expect(deviceTrust.verify('qa-other@example.test', PASSWORD_HASH, session.deviceToken)).toBeNull()
  })

  it('пароль сменён (другой hash) — старая cookie недействительна, резерв идёт по email', async () => {
    const { login, limiter, deviceLimiter } = setup({ account: { passwordHash: NEW_PASSWORD_HASH } })

    await rejectionOf(login(input(WRONG_PASSWORD), deviceTrust.issue(EMAIL, PASSWORD_HASH)))

    expect(limiter.state.failures).toBe(1)
    expect(deviceLimiter.state.reservations).toBe(0)
  })

  it('учителя нет — cookie недействительна', async () => {
    const { login, deviceLimiter } = setup({ account: null })

    await rejectionOf(login(input(), deviceToken()))

    expect(deviceLimiter.state.reservations).toBe(0)
  })

  it('успешный вход с cookie снимает резерв устройства', async () => {
    const { login, deviceLimiter } = setup()

    await login(input(), deviceToken())

    expect(deviceLimiter.state.reservations).toBe(1)
    expect(deviceLimiter.state.failures).toBe(0)
  })

  it('503 во время сверки с cookie снимает резерв устройства', async () => {
    const { login, hasher, limiter, deviceLimiter } = setup()
    hasher.state.busyOnVerify = true

    expect(await rejectionOf(login(input(), deviceToken()))).toBeInstanceOf(ServiceBusyError)

    expect(deviceLimiter.state.failures).toBe(0)
    expect(limiter.state.reservations).toBe(0)
  })
})
