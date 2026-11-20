import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { DeviceTrust } from '../types'

const DEVICE_NONCE_BYTES = 16
const NONCE_ENCODING = 'base64url'
const HMAC_ALGORITHM = 'sha256'
const MAC_ENCODING = 'hex'
const TOKEN_VERSION = 'v1'
const TOKEN_SEPARATOR = '.'
// Доменный префикс: подпись устройства не совпадёт с hashOpaqueToken, считаемым тем же ключом
const MAC_DOMAIN = `device:${TOKEN_VERSION}:`
const TOKEN_PARTS = 3
const MAC_PATTERN = /^[0-9a-f]{64}$/
const NONCE_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${Math.ceil((DEVICE_NONCE_BYTES * 8) / 6)}}$`)

export function makeDeviceTrust(hmacSecret: string): DeviceTrust {
  const macOf = (email: string, passwordHash: string, nonce: string): Buffer =>
    createHmac(HMAC_ALGORITHM, hmacSecret).update(`${MAC_DOMAIN}${email}:${passwordHash}:${nonce}`).digest()

  return {
    verify(email, passwordHash, token) {
      if (token === undefined) return null
      const parts = token.split(TOKEN_SEPARATOR)
      if (parts.length !== TOKEN_PARTS) return null
      const [version, nonce, mac] = parts
      if (version !== TOKEN_VERSION || nonce === undefined || mac === undefined || !NONCE_PATTERN.test(nonce) || !MAC_PATTERN.test(mac)) return null

      const expected = macOf(email, passwordHash, nonce)
      const actual = Buffer.from(mac, MAC_ENCODING)
      if (!timingSafeEqual(actual, expected)) return null
      return nonce
    },

    issue(email, passwordHash) {
      const nonce = randomBytes(DEVICE_NONCE_BYTES).toString(NONCE_ENCODING)
      return [TOKEN_VERSION, nonce, macOf(email, passwordHash, nonce).toString(MAC_ENCODING)].join(TOKEN_SEPARATOR)
    },
  }
}
