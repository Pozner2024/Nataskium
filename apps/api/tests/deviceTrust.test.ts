import { describe, expect, it } from 'vitest'
import { makeDeviceTrust } from '../src/features/auth'

const SECRET = 'qa-fake-hmac-secret-0123456789abcdef'
const EMAIL = 'qa-anna@example.test'
const OTHER_EMAIL = 'qa-boris@example.test'
const HASH = '$argon2id$qa-hash-1'
const OTHER_HASH = '$argon2id$qa-hash-2'

const trust = makeDeviceTrust(SECRET)

function parts(token: string): [string, string, string] {
  const [version, nonce, mac] = token.split('.')
  return [version ?? '', nonce ?? '', mac ?? '']
}

describe('deviceTrust', () => {
  it('валидный токен принимается для своего email и возвращает nonce', () => {
    const token = trust.issue(EMAIL, HASH)

    expect(trust.verify(EMAIL, HASH, token)).toBe(parts(token)[1])
  })

  it('токен не содержит email и каждый раз новый', () => {
    const token = trust.issue(EMAIL, HASH)

    expect(token).not.toContain(EMAIL)
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]{22}\.[0-9a-f]{64}$/)
    expect(trust.issue(EMAIL, HASH)).not.toBe(token)
  })

  it('чужой email, другой ключ, мусор и другая версия — null', () => {
    const token = trust.issue(EMAIL, HASH)
    const [, nonce, mac] = parts(token)

    expect(trust.verify(OTHER_EMAIL, HASH, token)).toBeNull()
    expect(makeDeviceTrust('qa-another-secret-0123456789abcdef').verify(EMAIL, HASH, token)).toBeNull()
    expect(trust.verify(EMAIL, HASH, undefined)).toBeNull()
    expect(trust.verify(EMAIL, HASH, '')).toBeNull()
    expect(trust.verify(EMAIL, HASH, 'garbage')).toBeNull()
    expect(trust.verify(EMAIL, HASH, `v2.${nonce}.${mac}`)).toBeNull()
    expect(trust.verify(EMAIL, HASH, `${token}.extra`)).toBeNull()
  })

  it('другой passwordHash (пароль сменён) — null', () => {
    expect(trust.verify(EMAIL, OTHER_HASH, trust.issue(EMAIL, HASH))).toBeNull()
  })

  it('суффикс после 64 hex в mac — null', () => {
    const token = trust.issue(EMAIL, HASH)

    expect(trust.verify(EMAIL, HASH, `${token}00`)).toBeNull()
    expect(trust.verify(EMAIL, HASH, `${token}zz`)).toBeNull()
  })

  it('изменённые nonce и mac — null', () => {
    const [version, nonce, mac] = parts(trust.issue(EMAIL, HASH))
    const flipped = (value: string) => `${value[0] === 'a' ? 'b' : 'a'}${value.slice(1)}`

    expect(trust.verify(EMAIL, HASH, `${version}.${flipped(nonce)}.${mac}`)).toBeNull()
    expect(trust.verify(EMAIL, HASH, `${version}.${nonce}.${flipped(mac)}`)).toBeNull()
    expect(trust.verify(EMAIL, HASH, `${version}.${nonce}.${mac.slice(2)}`)).toBeNull()
    expect(trust.verify(EMAIL, HASH, `${version}.${nonce}.zz${mac.slice(2)}`)).toBeNull()
  })

  it('подпись не совпадает с hashOpaqueToken того же ключа (доменный префикс)', async () => {
    const { makeTokenService } = await import('../src/features/auth')
    const tokens = makeTokenService({ jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef', hmacSecret: SECRET })
    const [, nonce, mac] = parts(trust.issue(EMAIL, HASH))

    expect(tokens.hashOpaqueToken(`${EMAIL}:${nonce}`)).not.toBe(mac)
  })
})
