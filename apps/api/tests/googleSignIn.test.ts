import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTokenService } from '../src/features/auth'
import type { GoogleIdentityProvider } from '../src/features/auth'
import { GOOGLE_LINK_TTL_MS, makeGoogleSignIn } from '../src/features/auth/application/googleAuth'
import type { GoogleExchangeResult, TeacherAccount } from '../src/features/auth/types'
import { AppError, ExternalServiceError } from '../src/shared/errors'
import { type CallLog, makeFakeTeachers, makeMemoryPendingGoogleLinks, makeMemoryRefreshTokens } from './fakes/authFakes'

const NOW = new Date('2026-11-06T12:00:00Z')
const EMAIL = 'qa-anna@example.test'
const GOOGLE_ID = 'google-sub-anna'
const INPUT = { code: 'qa-code', codeVerifier: 'qa-verifier', nonce: 'qa-nonce' }
const LINK_TTL_MS = 10 * 60 * 1000
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/
const HEX_64 = /^[0-9a-f]{64}$/

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

const TEACHER_WITH_PASSWORD: TeacherAccount = {
  id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
  email: EMAIL,
  displayName: 'Анна Ли',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
  googleId: null,
  emailVerifiedAt: NOW,
}

let calls: CallLog

function exchangeOk(overrides: Partial<{ googleId: string; email: string; emailVerified: boolean; name: string | null }> = {}): GoogleExchangeResult {
  return { ok: true, profile: { googleId: GOOGLE_ID, email: EMAIL, emailVerified: true, name: 'Анна', ...overrides } }
}

function setup(options: { exchange?: GoogleExchangeResult | Error; accounts?: TeacherAccount[] } = {}) {
  const seen: { code?: string; codeVerifier?: string; nonce?: string } = {}
  const google: GoogleIdentityProvider = {
    createAuthorizationRequest: () => ({ url: 'https://accounts.google.com/', state: 's', codeVerifier: 'v', nonce: 'n' }),
    async exchangeCode(code, codeVerifier, nonce) {
      Object.assign(seen, { code, codeVerifier, nonce })
      const exchange = options.exchange ?? exchangeOk()
      if (exchange instanceof Error) throw exchange
      return exchange
    },
  }
  const fakeTeachers = makeFakeTeachers(calls, options.accounts ?? [])
  const refresh = makeMemoryRefreshTokens(calls)
  const links = makeMemoryPendingGoogleLinks(calls, fakeTeachers.accounts)
  const signIn = makeGoogleSignIn({
    teachers: fakeTeachers.teachers,
    pendingGoogleLinks: links.repository,
    google,
    refreshTokens: refresh.repository,
    tokens,
    now: () => NOW,
  })
  return { signIn, seen, accounts: fakeTeachers.accounts, refresh, links }
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('googleSignIn: отказы', () => {
  it('код, verifier и nonce передаются в обмен как есть', async () => {
    const { signIn, seen } = setup()

    await signIn(INPUT)

    expect(seen).toEqual(INPUT)
  })

  it('id_token не прошёл проверку — invalidToken, учитель не ищется', async () => {
    const { signIn } = setup({ exchange: { ok: false, reason: 'invalidToken' } })

    expect(await signIn(INPUT)).toEqual({ ok: false, reason: 'invalidToken' })
    expect(calls).not.toContain('teachers.signInWithGoogle')
  })

  // Без подтверждённой почты Google не ручается за адрес: привязка к учителю с этим email была бы захватом
  it('email_verified = false — unverifiedEmail, учитель с этим email не трогается', async () => {
    const { signIn, accounts } = setup({ exchange: exchangeOk({ emailVerified: false }), accounts: [{ ...TEACHER_WITH_PASSWORD }] })

    expect(await signIn(INPUT)).toEqual({ ok: false, reason: 'unverifiedEmail' })
    expect(calls).not.toContain('teachers.signInWithGoogle')
    expect(accounts[0]?.googleId).toBeNull()
  })

  it.each(['not-an-email', 'qa@localhost', 'учитель@example.test'])('email из Google не проходит emailSchema (%s) — invalidEmail', async (address) => {
    const { signIn } = setup({ exchange: exchangeOk({ email: address }) })

    expect(await signIn(INPUT)).toEqual({ ok: false, reason: 'invalidEmail' })
    expect(calls).not.toContain('teachers.signInWithGoogle')
  })

  it('у учителя другой Google-аккаунт — conflict, ни сессии, ни ссылки привязки', async () => {
    const { signIn, refresh, links } = setup({ accounts: [{ ...TEACHER_WITH_PASSWORD, googleId: 'google-sub-other' }] })

    expect(await signIn(INPUT)).toEqual({ ok: false, reason: 'conflict' })
    expect(refresh.rows).toEqual([])
    expect(links.rows).toEqual([])
  })

  it('сбой Google или сети — ExternalServiceError наружу', async () => {
    const { signIn } = setup({ exchange: new ExternalServiceError('google', 503) })

    await expect(signIn(INPUT)).rejects.toBeInstanceOf(ExternalServiceError)
  })
})

describe('googleSignIn: успех', () => {
  it('email из Google нормализуется так же, как при регистрации', async () => {
    const { signIn, accounts } = setup({ exchange: exchangeOk({ email: ' QA-Anna@Example.TEST ' }) })

    await signIn(INPUT)

    expect(accounts[0]?.email).toBe(EMAIL)
  })

  it.each([
    ['обычное имя', 'Анна', 'Анна'],
    ['с пробелами по краям', '  Анна  ', 'Анна'],
    ['нет имени', null, null],
    ['с RLO — без имени, а не отказ', 'Анна\u202e', null],
    ['длиннее 100 символов — без имени', 'я'.repeat(101), null],
    ['только невидимые символы — без имени', '\u200b', null],
  ])('имя из Google по правилам displayName: %s', async (_name, name, expected) => {
    const { signIn, accounts } = setup({ exchange: exchangeOk({ name }) })

    const outcome = await signIn(INPUT)

    expect(outcome.ok).toBe(true)
    expect(accounts[0]?.displayName).toBe(expected)
  })

  it('новый учитель — сессия сразу', async () => {
    const { signIn, refresh } = setup()

    const outcome = await signIn(INPUT)

    expect(outcome).toMatchObject({ ok: true, kind: 'session' })
    if (!outcome.ok || outcome.kind !== 'session') return
    expect(outcome.session.teacher).toMatchObject({ email: EMAIL, hasPassword: false, hasGoogle: true })
    expect(await tokens.verifyAccessToken(outcome.session.accessToken)).toEqual({ teacherId: outcome.session.teacher.id })
    expect(refresh.rows).toHaveLength(1)
  })

  it('учитель только с Google входит сразу по googleId, без ссылки привязки', async () => {
    const { signIn, links } = setup({ accounts: [{ ...TEACHER_WITH_PASSWORD, passwordHash: null, googleId: GOOGLE_ID }] })

    expect(await signIn(INPUT)).toMatchObject({ ok: true, kind: 'session' })
    expect(links.rows).toEqual([])
  })

  it('учитель с паролем и уже привязанным Google входит сразу', async () => {
    const { signIn } = setup({ accounts: [{ ...TEACHER_WITH_PASSWORD, googleId: GOOGLE_ID }] })

    expect(await signIn(INPUT)).toMatchObject({ ok: true, kind: 'session' })
  })
})

describe('googleSignIn: учитель с паролем без Google — привязка после ввода пароля', () => {
  it('GOOGLE_LINK_TTL_MS — 10 минут', () => {
    expect(GOOGLE_LINK_TTL_MS).toBe(LINK_TTL_MS)
  })

  it('linkRequired: сессии нет, googleId учителя не меняется', async () => {
    const { signIn, accounts, refresh } = setup({ accounts: [{ ...TEACHER_WITH_PASSWORD }] })

    const outcome = await signIn(INPUT)

    expect(outcome).toEqual({
      ok: true,
      kind: 'linkRequired',
      linkToken: expect.stringMatching(BASE64URL_43),
      linkSecret: expect.stringMatching(BASE64URL_43),
    })
    if (outcome.ok && outcome.kind === 'linkRequired') expect(outcome.linkSecret).not.toBe(outcome.linkToken)
    expect(refresh.rows).toEqual([])
    expect(accounts[0]?.googleId).toBeNull()
  })

  it('запись привязки: учитель, googleId из Google, HMAC токена и секрета cookie, срок now + 10 мин', async () => {
    const { signIn, links } = setup({ accounts: [{ ...TEACHER_WITH_PASSWORD }] })

    const outcome = await signIn(INPUT)
    const linkToken = outcome.ok && outcome.kind === 'linkRequired' ? outcome.linkToken : ''
    const linkSecret = outcome.ok && outcome.kind === 'linkRequired' ? outcome.linkSecret : ''

    expect(links.rows).toEqual([
      {
        id: expect.any(String),
        teacherId: TEACHER_WITH_PASSWORD.id,
        googleId: GOOGLE_ID,
        tokenHash: tokens.hashOpaqueToken(linkToken),
        linkSecretHash: tokens.hashOpaqueToken(linkSecret),
        expiresAt: new Date(NOW.getTime() + LINK_TTL_MS),
      },
    ])
    expect(links.rows[0]?.tokenHash).toMatch(HEX_64)
    expect(links.rows[0]?.linkSecretHash).toMatch(HEX_64)
    expect(JSON.stringify(links.rows)).not.toContain(linkToken)
    expect(JSON.stringify(links.rows)).not.toContain(linkSecret)
  })

  it('повторный callback заменяет ссылку: запись одна, старый токен не найти', async () => {
    const { signIn, links } = setup({ accounts: [{ ...TEACHER_WITH_PASSWORD }] })

    const first = await signIn(INPUT)
    const second = await signIn(INPUT)
    const tokenOf = (outcome: typeof first) => (outcome.ok && outcome.kind === 'linkRequired' ? outcome.linkToken : '')

    expect(tokenOf(first)).not.toBe(tokenOf(second))
    expect(links.rows).toHaveLength(1)
    expect(await links.repository.findByTokenHash(tokens.hashOpaqueToken(tokenOf(first)))).toBeNull()
    expect(await links.repository.findByTokenHash(tokens.hashOpaqueToken(tokenOf(second)))).not.toBeNull()
  })
})

describe('googleSignIn: учителя удалили между поиском и записью', () => {
  it('привязка: replaceForTeacher → false — invalidToken (на маршруте google_failed), ни ссылки, ни сессии', async () => {
    const { signIn, links, refresh } = setup({ accounts: [{ ...TEACHER_WITH_PASSWORD }] })
    links.state.teacherGone = true

    expect(await signIn(INPUT)).toEqual({ ok: false, reason: 'invalidToken' })
    expect(links.rows).toEqual([])
    expect(refresh.rows).toEqual([])
  })

  it('вход сразу: createFamily → false — 401 AppError, сессии нет', async () => {
    const { signIn, refresh } = setup({ accounts: [{ ...TEACHER_WITH_PASSWORD, googleId: GOOGLE_ID }] })
    refresh.state.teacherGone = true

    const error = await signIn(INPUT).then(
      () => undefined,
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ status: 401, message: 'Session is invalid or expired, sign in again' })
    expect(refresh.rows).toEqual([])
  })
})
