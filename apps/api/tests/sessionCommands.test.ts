import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeGetMe, makeLogout, makeLogoutAll, makeTokenService } from '../src/features/auth'
import type { TeacherAccount } from '../src/features/auth/types'
import { AppError } from '../src/shared/errors'
import { type CallLog, makeFakeTeachers, makeMemoryRefreshTokens } from './fakes/authFakes'

const NOW = new Date('2026-11-05T12:00:00Z')
const MS_PER_DAY = 24 * 60 * 60 * 1000
const TEACHER_ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const OTHER_TEACHER_ID = '0b9d8c7a-6f5e-4d3c-8b2a-1f0e9d8c7b6a'
const SESSION_INVALID = { status: 401, message: 'Session is invalid or expired, sign in again' }

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

let calls: CallLog

function setupTokens() {
  const refresh = makeMemoryRefreshTokens(calls)
  function family(teacherId: string) {
    const raw = tokens.generateOpaqueToken()
    const row = refresh.seed({
      teacherId,
      familyId: randomUUID(),
      familyExpiresAt: new Date(NOW.getTime() + 30 * MS_PER_DAY),
      tokenHash: tokens.hashOpaqueToken(raw),
      expiresAt: new Date(NOW.getTime() + 14 * MS_PER_DAY),
    })
    return { raw, familyId: row.familyId }
  }
  return { refresh, family }
}

function familiesOf(rows: { teacherId: string; familyId: string }[], teacherId: string) {
  return rows.filter((row) => row.teacherId === teacherId).map((row) => row.familyId).sort()
}

beforeEach(() => {
  calls = []
})

describe('logout', () => {
  it.each([
    ['undefined', undefined],
    ['пустая строка', ''],
  ])('нет токена (%s) — успех без обращения к базе', async (_name, token) => {
    const { refresh, family } = setupTokens()
    family(TEACHER_ID)

    await expect(makeLogout({ refreshTokens: refresh.repository, tokens })(token)).resolves.toBeUndefined()
    expect(calls).toEqual([])
    expect(refresh.rows).toHaveLength(1)
  })

  it.each(['unknown', 'garbage that is not base64url!'])('неизвестный токен (%s) — успех, ничего не удалено', async (kind) => {
    const { refresh, family } = setupTokens()
    family(TEACHER_ID)
    const token = kind === 'unknown' ? tokens.generateOpaqueToken() : kind

    await expect(makeLogout({ refreshTokens: refresh.repository, tokens })(token)).resolves.toBeUndefined()
    expect(refresh.rows).toHaveLength(1)
  })

  it('известный токен — удаляется только его семья', async () => {
    const { refresh, family } = setupTokens()
    const current = family(TEACHER_ID)
    const otherDevice = family(TEACHER_ID)
    const otherTeacher = family(OTHER_TEACHER_ID)

    await makeLogout({ refreshTokens: refresh.repository, tokens })(current.raw)

    expect(familiesOf(refresh.rows, TEACHER_ID)).toEqual([otherDevice.familyId])
    expect(familiesOf(refresh.rows, OTHER_TEACHER_ID)).toEqual([otherTeacher.familyId])
  })

  it('повторный выход тем же токеном — тоже успех', async () => {
    const { refresh, family } = setupTokens()
    const current = family(TEACHER_ID)
    const logout = makeLogout({ refreshTokens: refresh.repository, tokens })

    await logout(current.raw)

    await expect(logout(current.raw)).resolves.toBeUndefined()
  })
})

describe('logoutAll', () => {
  it('удаляет все семьи учителя, чужие не трогает', async () => {
    const { refresh, family } = setupTokens()
    family(TEACHER_ID)
    family(TEACHER_ID)
    const otherTeacher = family(OTHER_TEACHER_ID)

    await makeLogoutAll({ refreshTokens: refresh.repository })(TEACHER_ID)

    expect(familiesOf(refresh.rows, TEACHER_ID)).toEqual([])
    expect(familiesOf(refresh.rows, OTHER_TEACHER_ID)).toEqual([otherTeacher.familyId])
  })

  it('без сессий — успех', async () => {
    const { refresh } = setupTokens()

    await expect(makeLogoutAll({ refreshTokens: refresh.repository })(TEACHER_ID)).resolves.toBeUndefined()
  })
})

describe('getMe', () => {
  const account: TeacherAccount = {
    id: TEACHER_ID,
    email: 'qa-anna@example.test',
    displayName: null,
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
    googleId: 'google-sub-1',
    emailVerifiedAt: NOW,
  }

  it('учитель есть — TeacherView без хэша и googleId', async () => {
    const view = await makeGetMe({ teachers: makeFakeTeachers(calls, [account]).teachers })(TEACHER_ID)

    expect(view).toEqual({ id: TEACHER_ID, email: account.email, displayName: null, hasPassword: true, hasGoogle: true })
    expect(JSON.stringify(view)).not.toContain('$argon2id$')
    expect(JSON.stringify(view)).not.toContain('google-sub-1')
  })

  it('учителя нет — 401, а не 404', async () => {
    const getMe = makeGetMe({ teachers: makeFakeTeachers(calls, [account]).teachers })

    const error = await getMe(OTHER_TEACHER_ID).catch((rejection: unknown) => rejection)

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject(SESSION_INVALID)
  })
})
