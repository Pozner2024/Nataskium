import { describe, expect, it } from 'vitest'
import { makeStartGoogleReauth } from '../src/features/auth/application/startGoogleReauth'
import { makeTokenService } from '../src/features/auth'
import { AppError } from '../src/shared/errors'
import { makeFakeTeachers, makeMemoryPendingGoogleReauths } from './fakes/authFakes'

const NOW = new Date('2026-11-13T10:00:00Z')
const FIVE_MINUTES_MS = 5 * 60 * 1000
const tokens = makeTokenService({ jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef', hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef' })

const GOOGLE_TEACHER = { id: 'teacher-google', email: 'qa-anna@gmail.com', displayName: 'Анна', passwordHash: null, googleId: 'google-sub-anna', emailVerifiedAt: NOW }
const PASSWORD_TEACHER = { id: 'teacher-password', email: 'qa-boris@example.test', displayName: 'Борис', passwordHash: 'argon2-hash', googleId: null, emailVerifiedAt: NOW }
const BOTH_TEACHER = { id: 'teacher-both', email: 'qa-vera@example.test', displayName: 'Вера', passwordHash: 'argon2-hash', googleId: 'google-sub-vera', emailVerifiedAt: NOW }
const NO_LOGIN_TEACHER = { id: 'teacher-none', email: 'qa-galina@example.test', displayName: null, passwordHash: null, googleId: null, emailVerifiedAt: NOW }

function setup(accounts = [GOOGLE_TEACHER, PASSWORD_TEACHER, BOTH_TEACHER, NO_LOGIN_TEACHER], states = ['state-1']) {
  const calls: string[] = []
  const teachers = makeFakeTeachers(calls, accounts).teachers
  const reauths = makeMemoryPendingGoogleReauths(calls, accounts)
  const queue = [...states]
  const requested: string[] = []
  const start = makeStartGoogleReauth({
    teachers,
    pendingGoogleReauths: reauths.repository,
    google: {
      createAuthorizationRequest: () => {
        const state = queue.shift() ?? 'state-fallback'
        requested.push(state)
        return { url: `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`, state, codeVerifier: 'verifier', nonce: 'nonce' }
      },
    },
    tokens,
    now: () => NOW,
  })
  return { start, reauths, calls, requested }
}

describe('startGoogleReauth: кому можно подтвердить удаление через Google', () => {
  it('учитель без пароля с Google — адрес входа и запись с HMAC состояния, не самим состоянием', async () => {
    const { start, reauths } = setup()

    const request = await start(GOOGLE_TEACHER.id)

    expect(request.state).toBe('state-1')
    expect(reauths.rows).toHaveLength(1)
    expect(reauths.rows[0]!.stateHash).toBe(tokens.hashOpaqueToken('state-1'))
    expect(reauths.rows[0]!.stateHash).not.toContain('state-1')
  })

  it('срок записи — пять минут от текущего времени', async () => {
    const { start, reauths } = setup()

    await start(GOOGLE_TEACHER.id)

    expect(reauths.rows[0]!.expiresAt.getTime()).toBe(NOW.getTime() + FIVE_MINUTES_MS)
  })

  it('учитель с паролем — 409, записи нет, Google не вызывается', async () => {
    const { start, reauths, requested } = setup()

    const error = await start(PASSWORD_TEACHER.id).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ status: 409 })
    expect(reauths.rows).toEqual([])
    expect(requested).toEqual([])
  })

  it('у учителя есть и пароль, и Google — 409: удаление по паролю', async () => {
    const { start, reauths } = setup()

    await expect(start(BOTH_TEACHER.id)).rejects.toMatchObject({ status: 409 })
    expect(reauths.rows).toEqual([])
  })

  it('без пароля и без googleId — 409: подтвердить нечем', async () => {
    const { start, reauths } = setup()

    await expect(start(NO_LOGIN_TEACHER.id)).rejects.toMatchObject({ status: 409 })
    expect(reauths.rows).toEqual([])
  })

  it('учителя нет (сессия устарела) — 401', async () => {
    const { start, reauths } = setup()

    await expect(start('teacher-gone')).rejects.toMatchObject({ status: 401 })
    expect(reauths.rows).toEqual([])
  })
})

describe('startGoogleReauth: повторный запуск', () => {
  it('второй запуск заменяет запись: старый state больше не подтверждает удаление', async () => {
    const { start, reauths } = setup(undefined, ['state-1', 'state-2'])

    await start(GOOGLE_TEACHER.id)
    await start(GOOGLE_TEACHER.id)

    expect(reauths.rows).toHaveLength(1)
    expect(reauths.rows[0]!.stateHash).toBe(tokens.hashOpaqueToken('state-2'))
    expect(await reauths.repository.findByStateHash(tokens.hashOpaqueToken('state-1'))).toBeNull()
  })

  it('учителя удалили между проверкой и записью — 401, без записи', async () => {
    const calls: string[] = []
    const reauths = makeMemoryPendingGoogleReauths(calls, [])
    reauths.repository.replaceForTeacher = async () => false
    const start = makeStartGoogleReauth({
      teachers: makeFakeTeachers(calls, [GOOGLE_TEACHER]).teachers,
      pendingGoogleReauths: reauths.repository,
      google: { createAuthorizationRequest: () => ({ url: 'https://accounts.google.com/', state: 's', codeVerifier: 'v', nonce: 'n' }) },
      tokens,
      now: () => NOW,
    })

    await expect(start(GOOGLE_TEACHER.id)).rejects.toMatchObject({ status: 401 })
  })
})
