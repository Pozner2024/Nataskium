import { changePasswordSchema } from '@nataskium/shared/schemas'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeChangePassword, makeTokenService } from '../src/features/auth'
import type { TeacherAccount } from '../src/features/auth/types'
import { RateLimitedError, ServiceBusyError } from '../src/shared/errors'
import {
  type CallLog,
  flushBackground,
  makeFakeHasher,
  makeFakeLimiter,
  makeFakeRefreshTokens,
  makeFakeTeachers,
} from './fakes/authFakes'
import { makeRecordingEmailSender } from './fakes/recordingEmailSender'

const NOW = new Date('2026-11-10T12:00:00Z')
const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const NEW_PASSWORD = 'qa-battery-staple-2031'
const TEACHER_ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SESSION_INVALID = { status: 401, message: 'Session is invalid or expired, sign in again' }
// 400, а не 401: на 401 фронтенд решил бы, что сессия истекла
const WRONG_PASSWORD = { status: 400, message: 'Wrong password' }
const GOOGLE_ONLY = { status: 409, message: 'This account signs in with Google and has no password' }

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

let calls: CallLog

function setup(options: { teacher?: Partial<TeacherAccount> | null } = {}) {
  const hasher = makeFakeHasher(calls)
  const limiter = makeFakeLimiter(calls)
  const refresh = makeFakeRefreshTokens(calls)
  const email = makeRecordingEmailSender()
  const account: TeacherAccount = {
    id: TEACHER_ID,
    email: EMAIL,
    displayName: 'Анна',
    passwordHash: hasher.hashOf(PASSWORD),
    googleId: null,
    emailVerifiedAt: NOW,
    ...options.teacher,
  }
  const fake = makeFakeTeachers(calls, options.teacher === null ? [] : [account])
  const changePassword = makeChangePassword({
    teachers: fake.teachers,
    hasher: hasher.hasher,
    failureLimiter: limiter.limiter,
    emailSender: email.sender,
    refreshTokens: refresh.repository,
    tokens,
    now: () => NOW,
  })
  return { changePassword, accounts: fake.accounts, hasher, limiter, refresh, email }
}

function input(currentPassword = PASSWORD, newPassword = NEW_PASSWORD) {
  return changePasswordSchema.parse({ currentPassword, newPassword })
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

describe('changePassword: отказы до сверки пароля', () => {
  it('учителя нет (удалён, access-токен жив) — 401, лимит не тратится', async () => {
    const { changePassword, limiter } = setup({ teacher: null })

    expect(await rejectionOf(changePassword(TEACHER_ID, input()))).toMatchObject(SESSION_INVALID)
    expect(limiter.state.reservations).toBe(0)
  })

  it('учитель только с Google — 409, без сверки и без резерва', async () => {
    const { changePassword, limiter, accounts } = setup({ teacher: { passwordHash: null, googleId: 'google-sub-anna' } })

    expect(await rejectionOf(changePassword(TEACHER_ID, input()))).toMatchObject(GOOGLE_ONLY)
    expect(limiter.state.reservations).toBe(0)
    expect(calls).not.toContain('hasher.verify')
    expect(accounts[0]?.passwordHash).toBeNull()
  })

  it('очередь хэширования заполнена — 503 до резерва', async () => {
    const { changePassword, hasher, limiter } = setup()
    hasher.state.busy = true

    expect(await rejectionOf(changePassword(TEACHER_ID, input()))).toBeInstanceOf(ServiceBusyError)
    expect(limiter.state.reservations).toBe(0)
  })

  it('лимит неудач исчерпан — 429 без сверки', async () => {
    const { changePassword, limiter } = setup()
    limiter.state.blocked = true

    expect(await rejectionOf(changePassword(TEACHER_ID, input()))).toBeInstanceOf(RateLimitedError)
    expect(calls).not.toContain('hasher.verify')
  })
})

describe('changePassword: текущий пароль', () => {
  it('неверный — 400, неудача засчитана, пароль и сессии не тронуты, письма нет', async () => {
    const { changePassword, limiter, accounts, hasher, refresh, email } = setup()

    const error = await rejectionOf(changePassword(TEACHER_ID, input('qa-wrong-password')))
    await flushBackground()

    expect(error).toMatchObject(WRONG_PASSWORD)
    expect(limiter.state.failures).toBe(1)
    expect(accounts[0]?.passwordHash).toBe(hasher.hashOf(PASSWORD))
    expect(calls).not.toContain('teachers.changePassword')
    expect(calls).not.toContain('hasher.hash')
    expect(refresh.families).toHaveLength(0)
    expect(email.sent).toEqual([])
  })

  it('сбой сверки (503 во время argon2) — резерв снят, пароль прежний', async () => {
    const { changePassword, hasher, limiter, accounts } = setup()
    hasher.state.busyOnVerify = true

    expect(await rejectionOf(changePassword(TEACHER_ID, input()))).toBeInstanceOf(ServiceBusyError)
    expect(limiter.state.failures).toBe(0)
    expect(accounts[0]?.passwordHash).toBe(hasher.hashOf(PASSWORD))
  })
})

describe('changePassword: успех', () => {
  it('записывает хэш нового пароля, выдаёт новую сессию и снимает резерв', async () => {
    const { changePassword, accounts, hasher, limiter, refresh } = setup()

    const session = await changePassword(TEACHER_ID, input())

    expect(accounts[0]?.passwordHash).toBe(hasher.hashOf(NEW_PASSWORD))
    expect(limiter.state.failures).toBe(0)
    expect(refresh.families).toHaveLength(1)
    expect(refresh.families[0]?.token.teacherId).toBe(TEACHER_ID)
    expect(session.teacher).toMatchObject({ id: TEACHER_ID, email: EMAIL, hasPassword: true })
    expect(await tokens.verifyAccessToken(session.accessToken)).toEqual({ teacherId: TEACHER_ID })
  })

  it('порядок: сверка текущего → хэш нового → запись → новая сессия', async () => {
    const { changePassword } = setup()

    await changePassword(TEACHER_ID, input())

    const order = ['hasher.verify', 'hasher.hash', 'teachers.changePassword', 'refreshTokens.createFamily'].map((call) => calls.indexOf(call))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order).not.toContain(-1)
  })

  it('учителю уходит письмо о смене пароля', async () => {
    const { changePassword, email } = setup()

    await changePassword(TEACHER_ID, input())
    await flushBackground()

    expect(email.sent).toEqual([{ kind: 'passwordChanged', to: EMAIL, displayName: 'Анна', locale: 'ru' }])
  })

  it('аккаунт удалили во время смены — 401, сессия не выдаётся', async () => {
    const { changePassword, refresh } = setup()
    refresh.state.teacherGone = true

    expect(await rejectionOf(changePassword(TEACHER_ID, input()))).toMatchObject(SESSION_INVALID)
    expect(refresh.families).toHaveLength(0)
  })
})

describe('changePasswordSchema', () => {
  it('новый пароль — по правилам регистрации: короткий отклоняется', () => {
    const result = changePasswordSchema.safeParse({ currentPassword: PASSWORD, newPassword: 'abc' })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['newPassword'])
  })

  it('текущий пароль — без минимума и блок-листа', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'abc', newPassword: NEW_PASSWORD }).success).toBe(true)
  })
})
