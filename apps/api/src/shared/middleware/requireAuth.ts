import type { MiddlewareHandler } from 'hono'
import { UnauthorizedError } from '../errors'

declare module 'hono' {
  // Расширение интерфейса Hono (module augmentation): базовое no-unused-vars считает его неиспользуемым
  // eslint-disable-next-line no-unused-vars
  interface ContextVariableMap {
    teacherId: string
  }
}

const AUTHORIZATION_HEADER = 'Authorization'
const BEARER_PREFIX = 'Bearer '

// Проверка токена приходит параметром: middleware не знает ни секрета, ни jose (composition root — app.ts)
export type VerifyAccessToken = (token: string) => Promise<{ teacherId: string } | null>

export function makeRequireAuth(verifyAccessToken: VerifyAccessToken): MiddlewareHandler {
  return async (c, next) => {
    const authorization = c.req.header(AUTHORIZATION_HEADER)
    if (!authorization?.startsWith(BEARER_PREFIX)) throw new UnauthorizedError()

    const claims = await verifyAccessToken(authorization.slice(BEARER_PREFIX.length))
    if (claims === null) throw new UnauthorizedError()

    c.set('teacherId', claims.teacherId)
    await next()
  }
}
