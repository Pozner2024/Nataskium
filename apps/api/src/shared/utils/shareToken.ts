import { randomBytes } from 'node:crypto'

// 16 байт → 22 символа base64url без '=': формат shareTokenSchema
const SHARE_TOKEN_BYTES = 16

export function randomShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString('base64url')
}
