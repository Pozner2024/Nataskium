// Google OAuth 2.0 / OpenID Connect без googleapis: Authorization Code + PKCE (S256), state и nonce.
// Профиль берётся из id_token, подпись которого проверяет jose по ключам Google (JWKS). Не знает о Prisma
import { createHash, randomBytes } from 'node:crypto'
import { AUTH_TOKEN_BYTES } from '@nataskium/shared/schemas'
import { createRemoteJWKSet, errors, jwtVerify } from 'jose'
import { z } from 'zod'
import { ExternalServiceError } from '../../../shared/errors'
import type { GoogleExchangeResult, GoogleIdentityProvider } from '../types'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
// Google выдаёт id_token с одним из двух вариантов iss
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const GOOGLE_SERVICE = 'google'
const GOOGLE_API_TIMEOUT_MS = 8000
const ID_TOKEN_ALGORITHM = 'RS256'
const SCOPES = 'openid email profile'
const RANDOM_ENCODING = 'base64url'
const PKCE_METHOD = 'S256'
const REQUIRED_CLAIMS = ['sub', 'email', 'email_verified', 'nonce', 'iat', 'exp']

// Ответ token endpoint: нужен только id_token. access_token не сохраняется и не используется
const tokenResponseSchema = z.object({ id_token: z.string().min(1) })
// Из тела ошибки token endpoint берём только код OAuth (RFC 6749, 5.2); остальное не читаем и не логируем
const tokenErrorSchema = z.object({ error: z.string() })
const BAD_REQUEST_STATUS = 400
// Код использован, истёк или не совпал code_verifier — проблема этого входа, а не недоступность Google
const INVALID_GRANT_ERROR = 'invalid_grant'

// Ошибки самого id_token (подпись, формат, kid, алгоритм, iss/aud/exp). Всё остальное — загрузка ключей Google
// (ответ не 200, сеть, таймаут, битый JWKS) — сбой сервиса: учитель видит «Google недоступен», а не «вход не удался»
const INVALID_TOKEN_ERRORS = [
  errors.JWSSignatureVerificationFailed,
  errors.JWSInvalid,
  errors.JWTInvalid,
  errors.JWTClaimValidationFailed,
  errors.JWTExpired,
  errors.JWKSNoMatchingKey,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
]

function isInvalidTokenError(error: unknown): boolean {
  return INVALID_TOKEN_ERRORS.some((errorClass) => error instanceof errorClass)
}

const idTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: z.boolean(),
  nonce: z.string().min(1),
  name: z.string().optional(),
})

export type GoogleClientOptions = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

// 32 байта из CSPRNG в base64url: 43 символа — это и минимальная длина code_verifier по RFC 7636
function randomValue(): string {
  return randomBytes(AUTH_TOKEN_BYTES).toString(RANDOM_ENCODING)
}

function codeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest(RANDOM_ENCODING)
}

export function makeGoogleClient(options: GoogleClientOptions): GoogleIdentityProvider {
  // jose кэширует ключи Google и сам обновляет их при смене kid
  const googleKeys = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), { timeoutDuration: GOOGLE_API_TIMEOUT_MS })

  // null — Google отклонил код (invalid_grant): учитель видит «вход не удался», а не «Google недоступен»
  async function requestIdToken(code: string, codeVerifier: string): Promise<string | null> {
    let response: Response
    try {
      response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: options.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
        signal: AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS),
      })
    } catch {
      // Таймаут или сеть: исходную ошибку не прокидываем — в ней бывают параметры запроса
      throw new ExternalServiceError(GOOGLE_SERVICE, null)
    }

    if (response.status === BAD_REQUEST_STATUS) {
      const body = tokenErrorSchema.safeParse(await response.json().catch(() => null))
      if (body.success && body.data.error === INVALID_GRANT_ERROR) return null
      throw new ExternalServiceError(GOOGLE_SERVICE, response.status)
    }
    // 5xx, 429 и прочие ошибки (например, invalid_client — наша настройка): сбой сервиса, тело не читаем
    if (!response.ok) {
      await response.body?.cancel()
      throw new ExternalServiceError(GOOGLE_SERVICE, response.status)
    }
    const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) throw new ExternalServiceError(GOOGLE_SERVICE, response.status)
    return parsed.data.id_token
  }

  return {
    createAuthorizationRequest() {
      const state = randomValue()
      const codeVerifier = randomValue()
      const nonce = randomValue()
      const url = new URL(GOOGLE_AUTH_URL)
      url.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: options.redirectUri,
        response_type: 'code',
        scope: SCOPES,
        state,
        nonce,
        code_challenge: codeChallenge(codeVerifier),
        code_challenge_method: PKCE_METHOD,
        // Учитель с несколькими аккаунтами Google сам выбирает нужный
        prompt: 'select_account',
      }).toString()
      return { url: url.toString(), state, codeVerifier, nonce }
    },

    async exchangeCode(code, codeVerifier, nonce): Promise<GoogleExchangeResult> {
      const idToken = await requestIdToken(code, codeVerifier)
      if (idToken === null) return { ok: false, reason: 'invalidToken' }
      try {
        const { payload } = await jwtVerify(idToken, googleKeys, {
          algorithms: [ID_TOKEN_ALGORITHM],
          issuer: GOOGLE_ISSUERS,
          audience: options.clientId,
          requiredClaims: REQUIRED_CLAIMS,
        })
        const claims = idTokenClaimsSchema.safeParse(payload)
        // nonce связывает id_token с этим входом: чужой токен, перехваченный в другом входе, не подойдёт
        if (!claims.success || claims.data.nonce !== nonce) return { ok: false, reason: 'invalidToken' }

        return {
          ok: true,
          profile: {
            googleId: claims.data.sub,
            email: claims.data.email,
            emailVerified: claims.data.email_verified,
            name: claims.data.name ?? null,
          },
        }
      } catch (error) {
        if (isInvalidTokenError(error)) return { ok: false, reason: 'invalidToken' }
        // Исходную ошибку не прокидываем: в ней бывают адрес и ответ Google
        throw new ExternalServiceError(GOOGLE_SERVICE, null)
      }
    },
  }
}
