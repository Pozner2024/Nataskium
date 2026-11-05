import { createHmac } from 'node:crypto'
import { SignJWT, UnsecuredJWT, decodeJwt, decodeProtectedHeader } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTokenService } from '../src/features/auth'
import { ACCESS_TOKEN_TTL_SECONDS } from '../src/features/auth/infrastructure/tokenService'

// Выдуманные секреты для тестов, длиннее минимума
const JWT_SECRET = 'qa-fake-jwt-secret-0123456789abcdef'
const HMAC_SECRET = 'qa-fake-hmac-secret-0123456789abcdef'
const OTHER_SECRET = 'qa-fake-other-secret-0123456789abcdef'
const TEACHER_ID = '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b'
const EXPECTED_TTL_SECONDS = 900
const ISSUER = 'nataskium-api'
const AUDIENCE = 'nataskium-web'
const ACCESS_TOKEN_TYPE = 'at+jwt'
const OPAQUE_TOKEN_LENGTH = 43
const OPAQUE_TOKEN_BYTES = 32
const BASE64URL = /^[A-Za-z0-9_-]+$/
const HEX_64 = /^[0-9a-f]{64}$/
const UNIQUE_SAMPLE_SIZE = 1000
const MS_PER_SECOND = 1000

const service = makeTokenService({ jwtSecret: JWT_SECRET, hmacSecret: HMAC_SECRET })

type ForgedToken = {
  secret?: string
  alg?: string
  typ?: string | undefined
  issuer?: string | undefined
  audience?: string | undefined
  subject?: string | undefined
  expiresIn?: string
}

// Токен «как настоящий», в котором меняется одна деталь
function forgeToken(overrides: ForgedToken = {}): Promise<string> {
  const settings = {
    secret: JWT_SECRET,
    alg: 'HS256',
    typ: ACCESS_TOKEN_TYPE,
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: TEACHER_ID,
    expiresIn: `${EXPECTED_TTL_SECONDS}s`,
    ...overrides,
  }
  const jwt = new SignJWT({}).setProtectedHeader({ alg: settings.alg, ...(settings.typ ? { typ: settings.typ } : {}) })
  if (settings.subject !== undefined) jwt.setSubject(settings.subject)
  if (settings.issuer !== undefined) jwt.setIssuer(settings.issuer)
  if (settings.audience !== undefined) jwt.setAudience(settings.audience)
  return jwt.setIssuedAt().setExpirationTime(settings.expiresIn).sign(new TextEncoder().encode(settings.secret))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('tokenService: access-токен', () => {
  it('подписывается HS256 с typ at+jwt, iss, aud и sub', async () => {
    const token = await service.signAccessToken(TEACHER_ID)

    expect(decodeProtectedHeader(token)).toEqual({ alg: 'HS256', typ: ACCESS_TOKEN_TYPE })
    expect(decodeJwt(token)).toMatchObject({ sub: TEACHER_ID, iss: ISSUER, aud: AUDIENCE })
  })

  it(`живёт ${EXPECTED_TTL_SECONDS} секунд`, async () => {
    const { iat, exp } = decodeJwt(await service.signAccessToken(TEACHER_ID))

    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(EXPECTED_TTL_SECONDS)
    expect(Number(exp) - Number(iat)).toBe(EXPECTED_TTL_SECONDS)
  })

  it('в payload нет ничего, кроме служебных полей', async () => {
    const payload = decodeJwt(await service.signAccessToken(TEACHER_ID))

    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub'])
  })

  it('свой токен проходит проверку', async () => {
    const token = await service.signAccessToken(TEACHER_ID)

    expect(await service.verifyAccessToken(token)).toEqual({ teacherId: TEACHER_ID })
  })

  it('действует до конца срока и не дольше', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'))
    const token = await service.signAccessToken(TEACHER_ID)

    vi.setSystemTime(Date.now() + (EXPECTED_TTL_SECONDS - 1) * MS_PER_SECOND)
    expect(await service.verifyAccessToken(token)).toEqual({ teacherId: TEACHER_ID })

    vi.setSystemTime(Date.now() + 2 * MS_PER_SECOND)
    expect(await service.verifyAccessToken(token)).toBeNull()
  })
})

describe('tokenService: отказ в проверке', () => {
  it.each<[string, ForgedToken]>([
    ['подписан другим секретом', { secret: OTHER_SECRET }],
    ['подписан HMAC-секретом', { secret: HMAC_SECRET }],
    ['алгоритм HS512', { alg: 'HS512' }],
    ['алгоритм HS384', { alg: 'HS384' }],
    ['typ JWT', { typ: 'JWT' }],
    ['без typ', { typ: undefined }],
    ['typ refresh', { typ: 'rt+jwt' }],
    ['чужой iss', { issuer: 'other-api' }],
    ['без iss', { issuer: undefined }],
    ['чужой aud', { audience: 'other-web' }],
    ['aud API вместо фронтенда', { audience: ISSUER }],
    ['без aud', { audience: undefined }],
    ['без sub', { subject: undefined }],
    ['sub не UUID', { subject: 'teacher-1' }],
    ['sub — пустая строка', { subject: '' }],
    ['истёк', { expiresIn: '-1s' }],
  ])('%s → null', async (_name, overrides) => {
    expect(await service.verifyAccessToken(await forgeToken(overrides))).toBeNull()
  })

  it('контроль: подделка без изменений проходит, значит отказы выше — из-за изменённой детали', async () => {
    expect(await service.verifyAccessToken(await forgeToken())).toEqual({ teacherId: TEACHER_ID })
  })

  it.each([
    ['без exp: бессрочный токен', (jwt: SignJWT) => jwt.setIssuedAt()],
    ['без iat', (jwt: SignJWT) => jwt.setExpirationTime('15m')],
  ])('%s → null', async (_name, setTimes) => {
    const jwt = new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: ACCESS_TOKEN_TYPE })
      .setSubject(TEACHER_ID)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)

    expect(await service.verifyAccessToken(await setTimes(jwt).sign(new TextEncoder().encode(JWT_SECRET)))).toBeNull()
  })

  it('alg none → null', async () => {
    const token = new UnsecuredJWT({})
      .setSubject(TEACHER_ID)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('15m')
      .encode()

    expect(await service.verifyAccessToken(token)).toBeNull()
  })

  it('изменённый payload с прежней подписью → null', async () => {
    const [header, , signature] = (await service.signAccessToken(TEACHER_ID)).split('.')
    const payload = Buffer.from(
      JSON.stringify({ sub: '00000000-0000-4000-8000-000000000000', iss: ISSUER, aud: AUDIENCE, iat: 1, exp: 9999999999 }),
    ).toString('base64url')

    expect(await service.verifyAccessToken(`${header}.${payload}.${signature}`)).toBeNull()
  })

  it.each(['', 'not-a-jwt', 'a.b.c', '...'])('мусор %j → null без исключения', async (token) => {
    expect(await service.verifyAccessToken(token)).toBeNull()
  })

  it('токен другого экземпляра с другим JWT_SECRET → null', async () => {
    const other = makeTokenService({ jwtSecret: OTHER_SECRET, hmacSecret: HMAC_SECRET })

    expect(await service.verifyAccessToken(await other.signAccessToken(TEACHER_ID))).toBeNull()
  })
})

describe('tokenService: одноразовые токены', () => {
  it(`generateOpaqueToken: ${OPAQUE_TOKEN_LENGTH} символа base64url из ${OPAQUE_TOKEN_BYTES} байт`, () => {
    const token = service.generateOpaqueToken()

    expect(token).toHaveLength(OPAQUE_TOKEN_LENGTH)
    expect(token).toMatch(BASE64URL)
    expect(Buffer.from(token, 'base64url')).toHaveLength(OPAQUE_TOKEN_BYTES)
  })

  it('generateOpaqueToken не повторяется', () => {
    const tokens = new Set(Array.from({ length: UNIQUE_SAMPLE_SIZE }, () => service.generateOpaqueToken()))

    expect(tokens.size).toBe(UNIQUE_SAMPLE_SIZE)
  })

  it('hashOpaqueToken: HMAC-SHA256 с HMAC_SECRET в hex', () => {
    const token = service.generateOpaqueToken()
    const expected = createHmac('sha256', HMAC_SECRET).update(token).digest('hex')

    expect(service.hashOpaqueToken(token)).toMatch(HEX_64)
    expect(service.hashOpaqueToken(token)).toBe(expected)
  })

  it('hashOpaqueToken детерминирован', () => {
    const token = service.generateOpaqueToken()

    expect(service.hashOpaqueToken(token)).toBe(service.hashOpaqueToken(token))
  })

  it('hashOpaqueToken зависит от токена', () => {
    expect(service.hashOpaqueToken('token-a')).not.toBe(service.hashOpaqueToken('token-b'))
  })

  it('hashOpaqueToken зависит от HMAC_SECRET', () => {
    const other = makeTokenService({ jwtSecret: JWT_SECRET, hmacSecret: OTHER_SECRET })
    const token = service.generateOpaqueToken()

    expect(other.hashOpaqueToken(token)).not.toBe(service.hashOpaqueToken(token))
  })

  it('hashOpaqueToken не зависит от JWT_SECRET', () => {
    const other = makeTokenService({ jwtSecret: OTHER_SECRET, hmacSecret: HMAC_SECRET })
    const token = service.generateOpaqueToken()

    expect(other.hashOpaqueToken(token)).toBe(service.hashOpaqueToken(token))
  })

  it('хэш не содержит токен', () => {
    const token = service.generateOpaqueToken()

    expect(service.hashOpaqueToken(token)).not.toContain(token)
  })
})
