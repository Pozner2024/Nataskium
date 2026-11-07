import { inspect } from 'node:util'
import { deleteAccountSchema } from '@nataskium/shared/schemas'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTeacherRepository } from '../src/features/auth'
import { makeDeleteAccount } from '../src/features/auth/application/deleteAccount'
import type { TeacherAccount, TeacherRepository } from '../src/features/auth/types'
import { Prisma, type PrismaClient } from '../src/generated/prisma/client'
import { AppError, RateLimitedError, ServiceBusyError } from '../src/shared/errors'
import { type CallLog, makeFakeHasher, makeFakeLimiter, makeFakeTeachers } from './fakes/authFakes'

const NOW = new Date('2026-11-07T12:00:00Z')
const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const TEACHER_ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const SESSION_INVALID = { status: 401, message: 'Session is invalid or expired, sign in again' }
// 400, а не 401: на 401 фронтенд решил бы, что сессия истекла
const WRONG_PASSWORD = { status: 400, message: 'Wrong password' }
const GOOGLE_ONLY = { status: 409, message: 'Accounts created with Google can be deleted through support for now' }

let calls: CallLog

function setup(options: { teacher?: Partial<TeacherAccount> | null; teachers?: TeacherRepository } = {}) {
  const hasher = makeFakeHasher(calls)
  const limiter = makeFakeLimiter(calls)
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
  const deleteAccount = makeDeleteAccount({ teachers: options.teachers ?? fake.teachers, hasher: hasher.hasher, failureLimiter: limiter.limiter })
  return { deleteAccount, accounts: fake.accounts, hasher, limiter }
}

function input(password = PASSWORD) {
  return deleteAccountSchema.parse({ password })
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

describe('deleteAccount: отказы до сверки пароля', () => {
  it('учителя нет (уже удалён, access-токен жив) — 401, лимит не тратится', async () => {
    const { deleteAccount, limiter } = setup({ teacher: null })

    const error = await rejectionOf(deleteAccount(TEACHER_ID, input()))

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject(SESSION_INVALID)
    expect(limiter.state.reservations).toBe(0)
  })

  it('учитель только с Google — 409, без сверки и без резерва', async () => {
    const { deleteAccount, limiter, accounts } = setup({ teacher: { passwordHash: null, googleId: 'google-sub-anna' } })

    expect(await rejectionOf(deleteAccount(TEACHER_ID, input()))).toMatchObject(GOOGLE_ONLY)
    expect(limiter.state.reservations).toBe(0)
    expect(calls).not.toContain('hasher.verify')
    expect(accounts).toHaveLength(1)
  })

  it('очередь хэширования заполнена — 503 до резерва', async () => {
    const { deleteAccount, hasher, limiter } = setup()
    hasher.state.busy = true

    expect(await rejectionOf(deleteAccount(TEACHER_ID, input()))).toBeInstanceOf(ServiceBusyError)
    expect(limiter.state.reservations).toBe(0)
  })

  it('лимит неудач исчерпан — 429 без сверки', async () => {
    const { deleteAccount, limiter, accounts } = setup()
    limiter.state.blocked = true

    expect(await rejectionOf(deleteAccount(TEACHER_ID, input()))).toBeInstanceOf(RateLimitedError)
    expect(calls).not.toContain('hasher.verify')
    expect(accounts).toHaveLength(1)
  })
})

describe('deleteAccount: пароль', () => {
  it('резерв берётся по email учителя до сверки пароля', async () => {
    const { deleteAccount } = setup()

    await deleteAccount(TEACHER_ID, input())

    expect(calls.indexOf(`limiter.reserve:${EMAIL}`)).toBeLessThan(calls.indexOf('hasher.verify'))
    expect(calls.indexOf('hasher.assertCapacity')).toBeLessThan(calls.indexOf(`limiter.reserve:${EMAIL}`))
  })

  it('неверный пароль — 400, неудача засчитана, аккаунт цел', async () => {
    const { deleteAccount, limiter, accounts } = setup()

    const error = await rejectionOf(deleteAccount(TEACHER_ID, input('qa-wrong-password')))

    expect(error).toMatchObject(WRONG_PASSWORD)
    expect(limiter.state.failures).toBe(1)
    expect(accounts).toHaveLength(1)
    expect(calls.some((call) => call.startsWith('teachers.deleteAccount'))).toBe(false)
  })

  it('сбой сверки (503 во время argon2) — резерв снят, аккаунт цел', async () => {
    const { deleteAccount, hasher, limiter, accounts } = setup()
    hasher.state.busyOnVerify = true

    expect(await rejectionOf(deleteAccount(TEACHER_ID, input()))).toBeInstanceOf(ServiceBusyError)
    expect(limiter.state.failures).toBe(0)
    expect(accounts).toHaveLength(1)
  })

  it('верный пароль — резерв снят, аккаунт удалён по id и email учителя из базы', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const { deleteAccount, limiter, accounts } = setup()

    await expect(deleteAccount(TEACHER_ID, input())).resolves.toBeUndefined()

    expect(limiter.state.failures).toBe(0)
    expect(accounts).toEqual([])
    expect(calls).toContain(`teachers.deleteAccount:${EMAIL}`)
  })
})

describe('deleteAccount: после удаления', () => {
  it('в логе только teacherId: email и имени удалённого учителя нет', async () => {
    const logged: unknown[] = []
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args)
      })
    }
    const { deleteAccount } = setup()

    await deleteAccount(TEACHER_ID, input())

    expect(logged).toEqual([['Teacher account deleted', { teacherId: TEACHER_ID }]])
    const text = inspect(logged, { depth: null })
    expect(text).not.toContain(EMAIL)
    expect(text).not.toContain('Анна')
  })

  it('параллельный запрос успел удалить раньше (deleteAccount → false) — 401, в логе ничего', async () => {
    const logged: unknown[] = []
    vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
      logged.push(args)
    })
    const { accounts } = setup()
    const teachers: TeacherRepository = {
      ...makeFakeTeachers(calls, accounts).teachers,
      deleteAccount: async () => false,
    }
    const racing = makeDeleteAccount({ teachers, hasher: makeFakeHasher(calls).hasher, failureLimiter: makeFakeLimiter(calls).limiter })

    expect(await rejectionOf(racing(TEACHER_ID, input()))).toMatchObject(SESSION_INVALID)
    expect(logged).toEqual([])
  })

  it('повторное удаление тем же учителем — 401', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const { deleteAccount } = setup()
    await deleteAccount(TEACHER_ID, input())

    expect(await rejectionOf(deleteAccount(TEACHER_ID, input()))).toMatchObject(SESSION_INVALID)
  })
})

describe('deleteAccountSchema', () => {
  it('пароль по правилам входа: популярный и короткий проходят', () => {
    expect(deleteAccountSchema.parse({ password: 'qwerty' })).toEqual({ password: 'qwerty' })
    expect(deleteAccountSchema.parse({ password: 'x' })).toEqual({ password: 'x' })
  })

  it('пустой пароль — Password is required; лишние поля отбрасываются', () => {
    expect(deleteAccountSchema.safeParse({ password: '' }).error?.issues[0]?.message).toBe('Password is required')
    expect(deleteAccountSchema.parse({ password: 'x', teacherId: 'evil' })).toEqual({ password: 'x' })
  })
})

describe('teacherRepository.deleteAccount: прерванная транзакция (P2034)', () => {
  // Только $transaction: deleteAccount других методов клиента не вызывает
  function prismaFailing(errors: unknown[]) {
    const state = { attempts: 0 }
    const prisma = {
      async $transaction() {
        state.attempts++
        const error = errors.shift()
        if (error !== undefined) throw error
        return true
      },
    } as unknown as PrismaClient
    return { prisma, state }
  }

  function transactionConflict() {
    return new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock', { code: 'P2034', clientVersion: 'qa' })
  }

  it('одна взаимоблокировка — повтор, удаление проходит', async () => {
    const { prisma, state } = prismaFailing([transactionConflict()])

    expect(await makeTeacherRepository(prisma).deleteAccount(TEACHER_ID, EMAIL)).toBe(true)
    expect(state.attempts).toBe(2)
  })

  it('две подряд — 503 ServiceBusyError с Retry-After: 1, третьей попытки нет', async () => {
    const { prisma, state } = prismaFailing([transactionConflict(), transactionConflict(), transactionConflict()])

    const error = await rejectionOf(makeTeacherRepository(prisma).deleteAccount(TEACHER_ID, EMAIL))

    expect(error).toBeInstanceOf(ServiceBusyError)
    expect(error).toMatchObject({ status: 503, retryAfterSeconds: 1, headers: { 'Retry-After': '1' } })
    expect(state.attempts).toBe(2)
  })

  it.each([
    ['другая ошибка Prisma (P2002)', new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'qa' })],
    ['не ошибка Prisma', new Error('connection lost')],
  ])('%s — наружу как есть, без повтора', async (_name, failure) => {
    const { prisma, state } = prismaFailing([failure])

    expect(await rejectionOf(makeTeacherRepository(prisma).deleteAccount(TEACHER_ID, EMAIL))).toBe(failure)
    expect(state.attempts).toBe(1)
  })
})
