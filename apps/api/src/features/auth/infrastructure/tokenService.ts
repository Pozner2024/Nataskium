import { createHmac, randomBytes } from 'node:crypto'
import { AUTH_TOKEN_BYTES } from '@nataskium/shared/schemas'
import { SignJWT, jwtVerify } from 'jose'
import { z } from 'zod'
import type { TokenService } from '../types'

const SECONDS_PER_MINUTE = 60
const ACCESS_TOKEN_TTL_MINUTES = 15
export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_MINUTES * SECONDS_PER_MINUTE

const JWT_ALGORITHM = 'HS256'
// RFC 9068: тип access-токена. С iss и aud он не даёт принять за access-токен другой JWT с тем же секретом
const ACCESS_TOKEN_TYPE = 'at+jwt'
const JWT_ISSUER = 'nataskium-api'
const JWT_AUDIENCE = 'nataskium-web'
const REQUIRED_CLAIMS = ['sub', 'iat', 'exp']
const OPAQUE_TOKEN_ENCODING = 'base64url'
const HMAC_ALGORITHM = 'sha256'
const HMAC_ENCODING = 'hex'

// Подпись, срок, iss, aud и typ проверяет jose; содержимое — эта схема, без приведения типов
const accessPayloadSchema = z.object({ sub: z.uuid() })

type TokenSecrets = { jwtSecret: string; hmacSecret: string }

export function makeTokenService({ jwtSecret, hmacSecret }: TokenSecrets): TokenService {
  const jwtKey = new TextEncoder().encode(jwtSecret)

  return {
    signAccessToken: (teacherId) =>
      new SignJWT({})
        .setProtectedHeader({ alg: JWT_ALGORITHM, typ: ACCESS_TOKEN_TYPE })
        .setSubject(teacherId)
        .setIssuer(JWT_ISSUER)
        .setAudience(JWT_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
        .sign(jwtKey),

    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, jwtKey, {
          algorithms: [JWT_ALGORITHM],
          typ: ACCESS_TOKEN_TYPE,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          requiredClaims: REQUIRED_CLAIMS,
        })
        const claims = accessPayloadSchema.safeParse(payload)
        return claims.success ? { teacherId: claims.data.sub } : null
      } catch {
        // Причина отказа клиенту не нужна: для него это всегда 401
        return null
      }
    },

    generateOpaqueToken: () => randomBytes(AUTH_TOKEN_BYTES).toString(OPAQUE_TOKEN_ENCODING),

    hashOpaqueToken: (token) => createHmac(HMAC_ALGORITHM, hmacSecret).update(token).digest(HMAC_ENCODING),
  }
}
