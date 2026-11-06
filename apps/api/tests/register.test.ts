import { inspect } from 'node:util'
import { registerSchema } from '@nataskium/shared/schemas'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PENDING_REGISTRATION_TTL_MS, makePasswordHasher, makeRegister, makeTokenService } from '../src/features/auth'
import type { PasswordHasher } from '../src/features/auth'
import type { TeacherAccount } from '../src/features/auth/types'
import {
  type CallLog,
  flushBackground,
  makeFakeHasher,
  makeFakePendingRegistrations,
  makeFakeQuota,
  makeFakeTeachers,
} from './fakes/authFakes'
import { makeRecordingEmailSender } from './fakes/recordingEmailSender'

const NOW = new Date('2026-11-05T12:00:00Z')
const EXPECTED_TTL_MS = 24 * 60 * 60 * 1000
const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const HEX_64 = /^[0-9a-f]{64}$/
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/
const ARGON2ID_PREFIX = '$argon2id$v=19$m=19456,t=2,p=1$'

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

const EXISTING_TEACHER: TeacherAccount = {
  id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
  email: EMAIL,
  displayName: null,
  passwordHash: null,
  googleId: 'google-sub-1',
  emailVerifiedAt: NOW,
}

let calls: CallLog

function setup(options: { existing?: TeacherAccount[]; quota?: number; failWith?: Error; hasher?: PasswordHasher } = {}) {
  const fakeHasher = makeFakeHasher(calls)
  const { quota, state: quotaState } = makeFakeQuota(calls)
  if (options.quota !== undefined) quotaState.remaining = options.quota
  const { teachers } = makeFakeTeachers(calls, options.existing ?? [])
  const pending = makeFakePendingRegistrations(calls)
  const email = makeRecordingEmailSender({ failWith: options.failWith })

  const register = makeRegister({
    teachers,
    pendingRegistrations: pending.repository,
    hasher: options.hasher ?? fakeHasher.hasher,
    tokens,
    emailSender: email.sender,
    registrationEmailQuota: quota,
    now: () => NOW,
  })
  return { register, pending, email, hashOf: fakeHasher.hashOf }
}

function input(overrides: { displayName?: string } = {}) {
  return registerSchema.parse({ email: EMAIL, password: PASSWORD, ...overrides })
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('register: порядок шагов', () => {
  // Иначе по времени ответа видно, есть ли адрес и исчерпан ли бюджет
  it.each([
    ['новая регистрация', {}],
    ['бюджет писем исчерпан', { quota: 0 }],
    ['email занят', { existing: [EXISTING_TEACHER] }],
  ])('хэш пароля считается первым: %s', async (_name, options) => {
    const { register } = setup(options)

    await register(input())

    expect(calls[0]).toBe('hasher.hash')
  })

  it('бюджет проверяется до поиска учителя', async () => {
    const { register } = setup()

    await register(input())

    expect(calls.slice(0, 3)).toEqual(['hasher.hash', `quota.tryConsume:${EMAIL}`, 'teachers.findByEmail'])
  })
})

describe('register: сверх бюджета писем', () => {
  it('ни записи, ни письма, учитель не ищется', async () => {
    const { register, pending, email } = setup({ quota: 0 })

    await expect(register(input())).resolves.toBeUndefined()
    await flushBackground()

    expect(pending.rows).toEqual([])
    expect(email.sent).toEqual([])
    expect(calls).not.toContain('teachers.findByEmail')
  })

  it('и для занятого email — без письма accountExists', async () => {
    const { register, email } = setup({ quota: 0, existing: [EXISTING_TEACHER] })

    await register(input())
    await flushBackground()

    expect(email.sent).toEqual([])
  })
})

describe('register: email уже занят', () => {
  it('письмо accountExists, записи регистрации нет', async () => {
    const { register, pending, email } = setup({ existing: [EXISTING_TEACHER] })

    await expect(register(input())).resolves.toBeUndefined()
    await flushBackground()

    expect(email.sent).toEqual([{ kind: 'accountExists', to: EMAIL, displayName: null }])
    expect(pending.rows).toEqual([])
  })
})

describe('register: новая регистрация', () => {
  it('запись с HMAC токена, хэшем пароля, именем и сроком now + 24 ч', async () => {
    const { register, pending, email, hashOf } = setup()

    await register(input({ displayName: 'Анна' }))
    await flushBackground()

    expect(pending.rows).toHaveLength(1)
    const [row] = pending.rows
    const [sent] = email.sent
    expect(sent?.kind).toBe('verification')
    const rawToken = sent?.kind === 'verification' ? sent.rawToken : ''

    expect(PENDING_REGISTRATION_TTL_MS).toBe(EXPECTED_TTL_MS)
    expect(row).toMatchObject({
      email: EMAIL,
      passwordHash: hashOf(PASSWORD),
      displayName: 'Анна',
      tokenHash: tokens.hashOpaqueToken(rawToken),
      expiresAt: new Date(NOW.getTime() + EXPECTED_TTL_MS),
    })
    expect(row?.tokenHash).toMatch(HEX_64)
  })

  it('в базе не сырой токен и не пароль', async () => {
    const { register, pending, email } = setup()

    await register(input())
    await flushBackground()

    const [sent] = email.sent
    const rawToken = sent?.kind === 'verification' ? sent.rawToken : ''
    const stored = JSON.stringify(pending.rows)
    expect(rawToken).toMatch(BASE64URL_43)
    expect(stored).not.toContain(rawToken)
    expect(pending.rows[0]?.passwordHash).not.toBe(PASSWORD)
  })

  it('без имени — displayName null', async () => {
    const { register, pending } = setup()

    await register(input())

    expect(pending.rows[0]?.displayName).toBeNull()
  })

  it('письмо с сырым токеном уходит на этот email', async () => {
    const { register, email } = setup()

    await register(input())
    await flushBackground()

    expect(email.sent).toEqual([
      { kind: 'verification', to: EMAIL, rawToken: expect.stringMatching(BASE64URL_43) },
    ])
  })

  // Имя из формы не подтверждено: в письме подтверждения его нет, иначе через него шёл бы фишинг на чужой адрес.
  // В письме «аккаунт уже есть» — имя существующего учителя
  it('письмо подтверждения не получает имя из формы', async () => {
    const { register, email } = setup()

    await register(input({ displayName: 'Visit evil.example now' }))
    await flushBackground()

    expect(email.sent).toEqual([{ kind: 'verification', to: EMAIL, rawToken: expect.stringMatching(BASE64URL_43) }])
  })

  it('письмо «аккаунт уже есть» получает имя существующего учителя, а не из формы', async () => {
    const { register, email } = setup({ existing: [{ ...EXISTING_TEACHER, displayName: 'Анна Ли' }] })

    await register(input({ displayName: 'Самозванец' }))
    await flushBackground()

    expect(email.sent).toEqual([{ kind: 'accountExists', to: EMAIL, displayName: 'Анна Ли' }])
  })

  it('у каждой регистрации свой токен', async () => {
    const { register, pending } = setup()

    await register(input())
    await register(input())

    expect(new Set(pending.rows.map((row) => row.tokenHash)).size).toBe(2)
  })

  it('с настоящим hasher пароль сохраняется как argon2id', async () => {
    const { register, pending } = setup({ hasher: await makePasswordHasher() })

    await register(input())

    expect(pending.rows[0]?.passwordHash.startsWith(ARGON2ID_PREFIX)).toBe(true)
  })
})

describe('register: сбой почты', () => {
  // В ошибке почтового сервиса бывают адрес и ссылка с токеном
  function mailError(): Error {
    const error = new Error(`Resend rejected ${EMAIL} https://nataskium.example/verify?token=qa-raw-token-in-error`)
    error.name = 'ResendError'
    return error
  }

  it.each([
    ['новая регистрация', {}],
    ['email занят', { existing: [EXISTING_TEACHER] }],
  ])('не ломает ответ: %s', async (_name, options) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { register } = setup({ ...options, failWith: mailError() })

    await expect(register(input())).resolves.toBeUndefined()
    await flushBackground()
  })

  it('синхронное исключение в отправке тоже не ломает ответ', async () => {
    const logged: unknown[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args)
    })
    const { register } = setup()
    const throwingSender = makeRegister({
      teachers: makeFakeTeachers(calls).teachers,
      pendingRegistrations: makeFakePendingRegistrations(calls).repository,
      hasher: makeFakeHasher(calls).hasher,
      tokens,
      emailSender: {
        sendVerificationEmail: () => {
          throw mailError()
        },
        sendAccountExistsEmail: () => {
          throw mailError()
        },
        sendPasswordResetEmail: () => {
          throw mailError()
        },
        sendPasswordChangedEmail: () => {
          throw mailError()
        },
        sendGoogleLinkedEmail: () => {
          throw mailError()
        },
      },
      registrationEmailQuota: makeFakeQuota(calls).quota,
      now: () => NOW,
    })

    await expect(register(input())).resolves.toBeUndefined()
    await expect(throwingSender(input())).resolves.toBeUndefined()
    await flushBackground()

    expect(inspect(logged, { depth: null })).not.toContain(EMAIL)
  })

  it('в логе только операция и тип ошибки — без email и токена', async () => {
    const logged: unknown[] = []
    for (const method of ['error', 'warn', 'info', 'log'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args)
      })
    }
    const { register, email } = setup({ failWith: mailError() })

    await register(input())
    await flushBackground()

    const [sent] = email.sent
    const rawToken = sent?.kind === 'verification' ? sent.rawToken : ''
    // inspect, а не JSON.stringify: у Error message и stack не перечисляемые, JSON показал бы {}
    const text = inspect(logged, { depth: null })
    expect(logged).toHaveLength(1)
    expect(text).toContain('register.verification')
    expect(text).toContain('ResendError')
    expect(text).not.toContain(EMAIL)
    expect(text).not.toContain(rawToken)
    expect(text).not.toContain('qa-raw-token-in-error')
  })
})
