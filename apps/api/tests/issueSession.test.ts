import { describe, expect, it } from 'vitest'
import { makeTokenService } from '../src/features/auth'
import {
  MAX_ACTIVE_SESSIONS,
  REFRESH_TOKEN_TTL_MS,
  SESSION_ABSOLUTE_TTL_MS,
  issueSession,
  toTeacherView,
} from '../src/features/auth/application/issueSession'
import type { TeacherAccount } from '../src/features/auth/types'
import { AppError } from '../src/shared/errors'
import { makeFakeRefreshTokens } from './fakes/authFakes'

const NOW = new Date('2026-11-05T12:00:00Z')
const MS_PER_DAY = 24 * 60 * 60 * 1000
// Решения пользователя: refresh скользящий на 14 дней, сессия не дольше 30 дней, не больше 5 сессий
const EXPECTED_REFRESH_TTL_MS = 14 * MS_PER_DAY
const EXPECTED_SESSION_TTL_MS = 30 * MS_PER_DAY
const EXPECTED_MAX_SESSIONS = 5

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

const BASE: TeacherAccount = {
  id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
  email: 'qa-anna@example.test',
  displayName: 'Анна',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
  googleId: 'google-sub-1',
  emailVerifiedAt: new Date('2026-11-05T12:00:00Z'),
}

describe('toTeacherView', () => {
  it.each([
    ['пароль и Google', BASE, { hasPassword: true, hasGoogle: true }],
    ['только пароль', { ...BASE, googleId: null }, { hasPassword: true, hasGoogle: false }],
    ['только Google', { ...BASE, passwordHash: null }, { hasPassword: false, hasGoogle: true }],
  ])('%s', (_name, account, flags) => {
    expect(toTeacherView(account)).toEqual({ id: BASE.id, email: BASE.email, displayName: 'Анна', ...flags })
  })

  it('не отдаёт хэш пароля, googleId и время подтверждения', () => {
    const view = toTeacherView(BASE)

    expect(Object.keys(view).sort()).toEqual(['displayName', 'email', 'hasGoogle', 'hasPassword', 'id'])
    expect(JSON.stringify(view)).not.toContain('$argon2id$')
    expect(JSON.stringify(view)).not.toContain('google-sub-1')
  })
})

describe('issueSession: сроки и лимит', () => {
  it('константы совпадают с решениями пользователя', () => {
    expect(REFRESH_TOKEN_TTL_MS).toBe(EXPECTED_REFRESH_TTL_MS)
    expect(SESSION_ABSOLUTE_TTL_MS).toBe(EXPECTED_SESSION_TTL_MS)
    expect(MAX_ACTIVE_SESSIONS).toBe(EXPECTED_MAX_SESSIONS)
  })

  it('новая семья: refresh на 14 дней (меньше остатка семьи 30 дней), лимит 5 семей', async () => {
    const calls: string[] = []
    const refresh = makeFakeRefreshTokens(calls)

    const session = await issueSession({ refreshTokens: refresh.repository, tokens, now: () => NOW }, BASE)

    expect(session.refreshTokenExpiresAt).toEqual(new Date(NOW.getTime() + EXPECTED_REFRESH_TTL_MS))
    expect(refresh.families).toEqual([
      {
        maxFamilies: EXPECTED_MAX_SESSIONS,
        token: {
          teacherId: BASE.id,
          familyId: expect.any(String),
          familyExpiresAt: new Date(NOW.getTime() + EXPECTED_SESSION_TTL_MS),
          tokenHash: tokens.hashOpaqueToken(session.refreshToken),
          expiresAt: session.refreshTokenExpiresAt,
        },
      },
    ])
  })

  it('у каждого входа своя семья и свой refresh-токен', async () => {
    const refresh = makeFakeRefreshTokens([])
    const deps = { refreshTokens: refresh.repository, tokens, now: () => NOW }

    const first = await issueSession(deps, BASE)
    const second = await issueSession(deps, BASE)

    expect(first.refreshToken).not.toBe(second.refreshToken)
    expect(refresh.families[0]?.token.familyId).not.toBe(refresh.families[1]?.token.familyId)
  })

  it('access-токен — для этого учителя', async () => {
    const session = await issueSession({ refreshTokens: makeFakeRefreshTokens([]).repository, tokens, now: () => NOW }, BASE)

    expect(await tokens.verifyAccessToken(session.accessToken)).toEqual({ teacherId: BASE.id })
  })
})

describe('issueSession: учителя удалили до записи сессии', () => {
  it('createFamily → false — 401 «сессия недействительна», токены не выдаются', async () => {
    const refresh = makeFakeRefreshTokens([])
    refresh.state.teacherGone = true

    const error = await issueSession({ refreshTokens: refresh.repository, tokens, now: () => NOW }, BASE).then(
      () => undefined,
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ status: 401, message: 'Session is invalid or expired, sign in again' })
    expect(refresh.families).toEqual([])
  })
})
