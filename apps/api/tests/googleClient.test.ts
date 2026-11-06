import { createHash } from 'node:crypto'
import { inspect } from 'node:util'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeGoogleClient } from '../src/features/auth'
import { ExternalServiceError } from '../src/shared/errors'

// fetch подменяется: token endpoint и ключи Google (JWKS) отвечают из теста, запросов к Google нет
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const CLIENT_ID = 'qa-fake-client.apps.googleusercontent.com'
const CLIENT_SECRET = 'qa-fake-google-secret-0123456789'
const REDIRECT_URI = 'https://nataskium.example/api/auth/google/callback'
const KEY_ID = 'qa-key-1'
const NONCE = 'qa-nonce-0123456789'
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>
let googleKey: KeyPair
let otherKey: KeyPair
let tokenRequests: { body: URLSearchParams; init: RequestInit }[]
let tokenResponse: () => Promise<Response>
let jwksResponse: () => Promise<Response>

function client() {
  return makeGoogleClient({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI })
}

type Claims = Partial<{ iss: string; aud: string; sub: string; email: string; email_verified: unknown; nonce: string; name: string; exp: string }>

async function idToken(claims: Claims = {}, options: { key?: KeyPair; alg?: string; omit?: string[]; noExp?: boolean; noIat?: boolean } = {}) {
  const payload: Record<string, unknown> = {
    sub: 'google-sub-anna',
    email: 'qa-anna@gmail.com',
    email_verified: true,
    nonce: NONCE,
    name: 'Анна',
    ...claims,
  }
  for (const key of options.omit ?? []) delete payload[key]
  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: options.alg ?? 'RS256', kid: KEY_ID })
    .setIssuer(claims.iss ?? 'https://accounts.google.com')
    .setAudience(claims.aud ?? CLIENT_ID)
  if (!options.noIat) jwt.setIssuedAt()
  if (!options.noExp) jwt.setExpirationTime(claims.exp ?? '1h')
  return jwt.sign((options.key ?? googleKey).privateKey)
}

function tokenReturns(token: string) {
  tokenResponse = () => Promise.resolve(new Response(JSON.stringify({ id_token: token, access_token: 'qa-access' }), { status: 200 }))
}

beforeAll(async () => {
  googleKey = await generateKeyPair('RS256', { extractable: true })
  otherKey = await generateKeyPair('RS256', { extractable: true })
})

beforeEach(async () => {
  tokenRequests = []
  const jwk = { ...(await exportJWK(googleKey.publicKey)), kid: KEY_ID, alg: 'RS256', use: 'sig' }
  jwksResponse = () => Promise.resolve(new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'content-type': 'application/json' } }))
  tokenReturns(await idToken())
  vi.stubGlobal('fetch', async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === TOKEN_URL) {
      tokenRequests.push({ body: new URLSearchParams(String(init.body)), init })
      return tokenResponse()
    }
    if (url === JWKS_URL) return jwksResponse()
    throw new Error(`unexpected fetch ${url}`)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

describe('createAuthorizationRequest', () => {
  it('URL Google с client_id, redirect_uri, code, scope, state, nonce, PKCE S256 и выбором аккаунта', () => {
    const request = client().createAuthorizationRequest()
    const url = new URL(request.url)

    expect(`${url.origin}${url.pathname}`).toBe(AUTH_URL)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state: request.state,
      nonce: request.nonce,
      code_challenge: createHash('sha256').update(request.codeVerifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })
  })

  it('state, verifier и nonce — 43 символа base64url, разные и новые при каждом входе; verifier и секрет не в URL', () => {
    const first = client().createAuthorizationRequest()
    const second = client().createAuthorizationRequest()

    for (const value of [first.state, first.codeVerifier, first.nonce]) expect(value).toMatch(BASE64URL_43)
    expect(new Set([first.state, first.codeVerifier, first.nonce]).size).toBe(3)
    expect(second.state).not.toBe(first.state)
    expect(first.url).not.toContain(first.codeVerifier)
    expect(first.url).not.toContain(CLIENT_SECRET)
  })
})

describe('exchangeCode: запрос к token endpoint', () => {
  it('POST формой: code, client_id, client_secret, redirect_uri, grant_type и code_verifier; с таймаутом', async () => {
    await client().exchangeCode('qa-code', 'qa-verifier', NONCE)

    expect(tokenRequests).toHaveLength(1)
    const [{ body, init }] = tokenRequests as [{ body: URLSearchParams; init: RequestInit }]
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(Object.fromEntries(body)).toEqual({
      code: 'qa-code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: 'qa-verifier',
    })
  })
})

describe('exchangeCode: id_token', () => {
  it('верный токен — профиль', async () => {
    expect(await client().exchangeCode('qa-code', 'qa-verifier', NONCE)).toEqual({
      ok: true,
      profile: { googleId: 'google-sub-anna', email: 'qa-anna@gmail.com', emailVerified: true, name: 'Анна' },
    })
  })

  it('iss без https:// — тоже от Google', async () => {
    tokenReturns(await idToken({ iss: 'accounts.google.com' }))

    expect((await client().exchangeCode('qa-code', 'qa-verifier', NONCE)).ok).toBe(true)
  })

  it('email_verified = false — профиль с emailVerified false: отказ — решение use-case', async () => {
    tokenReturns(await idToken({ email_verified: false }))

    expect(await client().exchangeCode('qa-code', 'qa-verifier', NONCE)).toMatchObject({ ok: true, profile: { emailVerified: false } })
  })

  it('без имени — name null', async () => {
    tokenReturns(await idToken({}, { omit: ['name'] }))

    expect(await client().exchangeCode('qa-code', 'qa-verifier', NONCE)).toMatchObject({ ok: true, profile: { name: null } })
  })

  it.each<[string, Claims, { key?: 'other'; alg?: string; omit?: string[] }?]>([
    ['чужой iss', { iss: 'https://evil.example' }],
    ['чужой aud', { aud: 'other-client.apps.googleusercontent.com' }],
    ['истёк', { exp: '-1m' }],
    ['другой nonce', { nonce: 'qa-other-nonce' }],
    ['без nonce', {}, { omit: ['nonce'] }],
    ['без email', {}, { omit: ['email'] }],
    ['без email_verified', {}, { omit: ['email_verified'] }],
    ['email_verified строкой', { email_verified: 'true' }],
    ['подписан не ключом Google', {}, { key: 'other' }],
  ])('%s — invalidToken', async (_name, claims, options = {}) => {
    tokenReturns(await idToken(claims, { ...options, key: options.key === 'other' ? otherKey : undefined }))

    expect(await client().exchangeCode('qa-code', 'qa-verifier', NONCE)).toEqual({ ok: false, reason: 'invalidToken' })
  })

  it.each([
    ['без exp: бессрочный токен', { noExp: true }],
    ['без iat', { noIat: true }],
  ])('%s — invalidToken', async (_name, options) => {
    tokenReturns(await idToken({}, options))

    expect(await client().exchangeCode('qa-code', 'qa-verifier', NONCE)).toEqual({ ok: false, reason: 'invalidToken' })
  })

  it('alg none (без подписи) — invalidToken', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: KEY_ID })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'x', email: 'a@b.co', email_verified: true, nonce: NONCE, exp: 9999999999, iat: 1 })).toString('base64url')
    tokenReturns(`${header}.${body}.`)

    expect(await client().exchangeCode('qa-code', 'qa-verifier', NONCE)).toEqual({ ok: false, reason: 'invalidToken' })
  })

  it('мусор вместо id_token — invalidToken', async () => {
    tokenReturns('not-a-jwt')

    expect(await client().exchangeCode('qa-code', 'qa-verifier', NONCE)).toEqual({ ok: false, reason: 'invalidToken' })
  })
})

describe('exchangeCode: сбои Google', () => {
  function expectSafe(error: unknown, status: number | null) {
    expect(error).toBeInstanceOf(ExternalServiceError)
    expect(error).toMatchObject({ service: 'google', status })
    const text = inspect(error, { depth: null })
    for (const secret of [CLIENT_SECRET, 'qa-code', 'qa-verifier', 'invalid_grant']) expect(text).not.toContain(secret)
  }

  // 401 (invalid_client — наша настройка), 429 и 5xx — сбой сервиса: тело не читается вовсе
  it.each([401, 403, 429, 500, 503])('HTTP %i — ExternalServiceError со статусом, тело не читается', async (status) => {
    const stream = { cancelled: false }
    tokenResponse = () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"error":"invalid_grant"}'))
            },
            cancel() {
              stream.cancelled = true
            },
          }),
          { status },
        ),
      )

    expectSafe(await rejectionOf(client().exchangeCode('qa-code', 'qa-verifier', NONCE)), status)
    expect(stream.cancelled).toBe(true)
  })

  // Код из ответа истёк, уже использован или выдан не нам: это «вход не удался», а не «Google недоступен»
  it('HTTP 400 invalid_grant — invalidToken, а не сбой сервиса', async () => {
    tokenResponse = () => Promise.resolve(new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad Request' }), { status: 400 }))

    expect(await client().exchangeCode('qa-code', 'qa-verifier', NONCE)).toEqual({ ok: false, reason: 'invalidToken' })
  })

  it('HTTP 400 invalid_grant: error_description в лог не попадает', async () => {
    const logged: unknown[] = []
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args)
      })
    }
    tokenResponse = () =>
      Promise.resolve(new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'qa-description-secret' }), { status: 400 }))

    await client().exchangeCode('qa-code', 'qa-verifier', NONCE)

    expect(inspect(logged, { depth: null })).not.toContain('qa-description-secret')
  })

  it.each([
    ['invalid_request', JSON.stringify({ error: 'invalid_request', error_description: `missing code_verifier for ${CLIENT_ID}` })],
    ['unsupported_grant_type', JSON.stringify({ error: 'unsupported_grant_type' })],
    ['Invalid_Grant в другом регистре', JSON.stringify({ error: 'Invalid_Grant' })],
    ['error не строкой', JSON.stringify({ error: ['invalid_grant'] })],
    ['invalid_grant только в описании', JSON.stringify({ error_description: 'invalid_grant' })],
    ['не JSON', '<html>Bad Request invalid_grant</html>'],
    ['пустое тело', ''],
  ])('HTTP 400 %s — ExternalServiceError(400) без текста ответа и адреса', async (_name, body) => {
    tokenResponse = () => Promise.resolve(new Response(body, { status: 400 }))

    const error = await rejectionOf(client().exchangeCode('qa-code', 'qa-verifier', NONCE))

    expectSafe(error, 400)
    const text = inspect(error, { depth: null })
    for (const part of ['invalid_request', 'missing code_verifier', '<html>', TOKEN_URL, CLIENT_ID]) expect(text).not.toContain(part)
  })

  it('HTTP 401 invalid_client — сбой настройки, ExternalServiceError(401), а не invalidToken', async () => {
    tokenResponse = () => Promise.resolve(new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }))

    expectSafe(await rejectionOf(client().exchangeCode('qa-code', 'qa-verifier', NONCE)), 401)
  })

  it('HTTP 401 с телом invalid_grant — всё равно сбой сервиса: invalid_grant учитывается только при 400', async () => {
    tokenResponse = () => Promise.resolve(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 401 }))

    expectSafe(await rejectionOf(client().exchangeCode('qa-code', 'qa-verifier', NONCE)), 401)
  })

  it('HTTP 429 — ExternalServiceError(429)', async () => {
    tokenResponse = () => Promise.resolve(new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), { status: 429 }))

    expectSafe(await rejectionOf(client().exchangeCode('qa-code', 'qa-verifier', NONCE)), 429)
  })

  it.each([
    ['без id_token', '{"access_token":"x"}'],
    ['не JSON', 'not json'],
    ['пустой id_token', '{"id_token":""}'],
  ])('200, но ответ не тот (%s) — ExternalServiceError', async (_name, body) => {
    tokenResponse = () => Promise.resolve(new Response(body, { status: 200 }))

    expectSafe(await rejectionOf(client().exchangeCode('qa-code', 'qa-verifier', NONCE)), 200)
  })

  it('сбой сети — ExternalServiceError без статуса и без исходной ошибки', async () => {
    tokenResponse = () => Promise.reject(new TypeError(`fetch failed ${TOKEN_URL} client_secret=${CLIENT_SECRET}`))

    const error = await rejectionOf(client().exchangeCode('qa-code', 'qa-verifier', NONCE))

    expectSafe(error, null)
    expect((error as Error).cause).toBeUndefined()
  })
})
