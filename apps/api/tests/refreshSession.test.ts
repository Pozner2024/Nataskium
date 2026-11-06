import { randomUUID } from 'node:crypto'
import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_REMAINING_SESSION_MS, makeRefreshSession, makeTokenService } from '../src/features/auth'
import type { TeacherAccount } from '../src/features/auth/types'
import { AppError } from '../src/shared/errors'
import { type CallLog, makeFakeTeachers, makeMemoryRefreshTokens } from './fakes/authFakes'

const NOW = new Date('2026-11-05T12:00:00Z')
const MS_PER_MINUTE = 60 * 1000
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE
const REFRESH_TTL_MS = 14 * MS_PER_DAY
const EXPECTED_MIN_REMAINING_MS = 15 * MS_PER_MINUTE
const SESSION_INVALID = { status: 401, message: 'Session is invalid or expired, sign in again' }
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

const TEACHER: TeacherAccount = {
  id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
  email: 'qa-anna@example.test',
  displayName: 'Анна',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
  googleId: null,
  emailVerifiedAt: NOW,
}

let calls: CallLog

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs)
}

function setup(options: { teacherExists?: boolean } = {}) {
  const refresh = makeMemoryRefreshTokens(calls)
  const { teachers } = makeFakeTeachers(calls, options.teacherExists === false ? [] : [TEACHER])
  const refreshSession = makeRefreshSession({ refreshTokens: refresh.repository, teachers, tokens, now: () => NOW })

  // Семья учителя и ещё одна семья — чтобы проверить, что удаляется только своя
  function seed(token: { familyExpiresAt?: Date; expiresAt?: Date; revokedAt?: Date | null } = {}) {
    const raw = tokens.generateOpaqueToken()
    const row = refresh.seed({
      teacherId: TEACHER.id,
      familyId: randomUUID(),
      familyExpiresAt: token.familyExpiresAt ?? at(20 * MS_PER_DAY),
      tokenHash: tokens.hashOpaqueToken(raw),
      expiresAt: token.expiresAt ?? at(7 * MS_PER_DAY),
      revokedAt: token.revokedAt ?? null,
    })
    return { raw, row }
  }
  const other = seed()
  calls.length = 0
  return { refreshSession, refresh, seed, other }
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

function familyIds(rows: { familyId: string }[]) {
  return [...new Set(rows.map((row) => row.familyId))]
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('refreshSession: отказ', () => {
  it('неизвестный токен — 401, ничего не удаляется', async () => {
    const { refreshSession, refresh } = setup()

    expect(await rejectionOf(refreshSession(tokens.generateOpaqueToken()))).toMatchObject(SESSION_INVALID)
    expect(refresh.rows).toHaveLength(1)
    expect(calls).toEqual(['refreshTokens.findByHash'])
  })

  it('отозванный токен (повторное использование) — семья удалена, 401, в логе только teacherId', async () => {
    const logged: unknown[] = []
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      logged.push(args)
    })
    const { refreshSession, refresh, seed, other } = setup()
    const { raw, row } = seed({ revokedAt: at(-MS_PER_MINUTE) })

    expect(await rejectionOf(refreshSession(raw))).toMatchObject(SESSION_INVALID)

    expect(familyIds(refresh.rows)).toEqual([other.row.familyId])
    expect(calls).toContain(`refreshTokens.deleteFamily:${row.familyId}`)
    expect(calls).not.toContain('refreshTokens.rotate')
    expect(logged).toEqual([['Refresh token reuse detected', { teacherId: TEACHER.id }]])
    const text = inspect(logged, { depth: null })
    expect(text).not.toContain(raw)
    expect(text).not.toContain(row.tokenHash)
    expect(text).not.toContain(TEACHER.email)
  })

  it.each([
    ['refresh истёк', { expiresAt: at(-1) }],
    ['refresh истекает ровно сейчас', { expiresAt: NOW }],
    ['до конца семьи меньше 15 минут', { familyExpiresAt: at(EXPECTED_MIN_REMAINING_MS - 1), expiresAt: at(EXPECTED_MIN_REMAINING_MS - 1) }],
    ['семья уже истекла', { familyExpiresAt: at(-1), expiresAt: at(-1) }],
  ])('%s — семья удалена, 401, нового токена нет', async (_name, token) => {
    const { refreshSession, refresh, seed, other } = setup()
    const { raw, row } = seed(token)

    expect(await rejectionOf(refreshSession(raw))).toMatchObject(SESSION_INVALID)

    expect(familyIds(refresh.rows)).toEqual([other.row.familyId])
    expect(calls).toContain(`refreshTokens.deleteFamily:${row.familyId}`)
    expect(calls).not.toContain('refreshTokens.rotate')
  })

  it('учителя нет — 401 без ротации', async () => {
    const { refreshSession, seed } = setup({ teacherExists: false })
    const { raw } = seed()

    expect(await rejectionOf(refreshSession(raw))).toMatchObject(SESSION_INVALID)
    expect(calls).not.toContain('refreshTokens.rotate')
  })

  it('токен успели ротировать параллельно (rotate → false) — семья удалена, 401, в логе только teacherId', async () => {
    const logged: unknown[] = []
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      logged.push(args)
    })
    const { refreshSession, refresh, seed, other } = setup()
    const { raw, row } = seed()
    refresh.state.rotateFails = true

    expect(await rejectionOf(refreshSession(raw))).toMatchObject(SESSION_INVALID)

    expect(familyIds(refresh.rows)).toEqual([other.row.familyId])
    expect(calls).toContain(`refreshTokens.deleteFamily:${row.familyId}`)
    expect(logged).toEqual([['Refresh token reuse detected', { teacherId: TEACHER.id }]])
  })

  it('все отказы неотличимы', async () => {
    const make = () => setup()
    const unknown = make()
    const revoked = make()
    const expired = make()
    const missingTeacher = setup({ teacherExists: false })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const errors = await Promise.all([
      rejectionOf(unknown.refreshSession(tokens.generateOpaqueToken())),
      rejectionOf(revoked.refreshSession(revoked.seed({ revokedAt: NOW }).raw)),
      rejectionOf(expired.refreshSession(expired.seed({ expiresAt: at(-1) }).raw)),
      rejectionOf(missingTeacher.refreshSession(missingTeacher.seed().raw)),
    ])

    for (const error of errors) expect(error).toBeInstanceOf(AppError)
    expect(new Set(errors.map((error) => JSON.stringify([(error as AppError).status, (error as AppError).message]))).size).toBe(1)
  })
})

describe('refreshSession: ротация', () => {
  it(`MIN_REMAINING_SESSION_MS — 15 минут`, () => {
    expect(MIN_REMAINING_SESSION_MS).toBe(EXPECTED_MIN_REMAINING_MS)
  })

  it('новый refresh на 14 дней, если семье осталось больше', async () => {
    const { refreshSession, refresh, seed } = setup()
    const { raw, row } = seed({ familyExpiresAt: at(20 * MS_PER_DAY) })

    const session = await refreshSession(raw)

    expect(session.refreshTokenExpiresAt).toEqual(at(REFRESH_TTL_MS))
    expect(refresh.rotations).toEqual([
      {
        oldTokenId: row.id,
        now: NOW,
        next: {
          teacherId: TEACHER.id,
          familyId: row.familyId,
          familyExpiresAt: row.familyExpiresAt,
          tokenHash: tokens.hashOpaqueToken(session.refreshToken),
          expiresAt: at(REFRESH_TTL_MS),
        },
      },
    ])
  })

  // Ветку min(now + 14 дней, конец семьи) через issueSession не проверить: там семья всегда новая, на 30 дней
  it.each([
    ['семье осталось 10 дней', 10 * MS_PER_DAY],
    ['семье осталось ровно 14 дней', REFRESH_TTL_MS],
    ['семье осталось ровно 15 минут', EXPECTED_MIN_REMAINING_MS],
  ])('новый refresh не дальше конца семьи: %s', async (_name, remainingMs) => {
    const { refreshSession, refresh, seed } = setup()
    const familyExpiresAt = at(remainingMs)
    const { raw } = seed({ familyExpiresAt, expiresAt: familyExpiresAt })

    const session = await refreshSession(raw)

    expect(session.refreshTokenExpiresAt).toEqual(familyExpiresAt)
    expect(refresh.rotations[0]?.next.expiresAt).toEqual(familyExpiresAt)
    expect(refresh.rotations[0]?.next.familyExpiresAt).toEqual(familyExpiresAt)
  })

  it('результат: новый access и refresh, teacher без хэша; старый токен отозван', async () => {
    const { refreshSession, refresh, seed } = setup()
    const { raw, row } = seed()

    const session = await refreshSession(raw)

    expect(await tokens.verifyAccessToken(session.accessToken)).toEqual({ teacherId: TEACHER.id })
    expect(session.refreshToken).toMatch(BASE64URL_43)
    expect(session.refreshToken).not.toBe(raw)
    expect(session.teacher).toEqual({ id: TEACHER.id, email: TEACHER.email, displayName: 'Анна', hasPassword: true, hasGoogle: false })
    expect(refresh.rows.find((candidate) => candidate.id === row.id)?.revokedAt).toEqual(NOW)
    expect(JSON.stringify(refresh.rows)).not.toContain(session.refreshToken)
  })

  it('повторное предъявление старого токена после ротации — семья удалена вместе с новым токеном', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { refreshSession, refresh, seed, other } = setup()
    const { raw } = seed()
    const fresh = await refreshSession(raw)

    expect(await rejectionOf(refreshSession(raw))).toMatchObject(SESSION_INVALID)
    expect(await rejectionOf(refreshSession(fresh.refreshToken))).toMatchObject(SESSION_INVALID)
    expect(familyIds(refresh.rows)).toEqual([other.row.familyId])
  })
})
