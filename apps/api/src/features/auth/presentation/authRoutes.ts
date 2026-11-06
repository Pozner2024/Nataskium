// HTTP-интерфейс auth: разбор тела shared-схемами, лимиты, refresh-токен в httpOnly cookie.
// Маршруты монтируются на /api/auth (план 1.7): Caddy префикс не срезает, в dev — nitro.devProxy
import { type LoginInput, type RegisterInput, type VerifyEmailInput, loginSchema, registerSchema, verifyEmailSchema } from '@nataskium/shared/schemas'
import { type Context, Hono, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { AppError, RateLimitedError } from '../../../shared/errors'
import type { RateLimiter } from '../../../shared/middleware'
import { readJsonBody } from '../../../shared/utils'
import type { AuthSession, TeacherView } from '../types'

export const AUTH_ROUTES_BASE_PATH = '/api/auth'

// С prefix: 'secure' Hono добавляет к имени __Secure- и требует Secure: cookie не уйдёт по http и не перепишется с http
const REFRESH_COOKIE_NAME = 'refresh_token'
const REFRESH_COOKIE_PREFIX = 'secure'
const REFRESH_COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  // Всегда, и в dev: localhost браузеры считают безопасным контекстом
  secure: true,
  sameSite: 'Strict',
  // Только маршрутам auth: cookie не уходит с запросами страниц и остального API
  path: AUTH_ROUTES_BASE_PATH,
  prefix: REFRESH_COOKIE_PREFIX,
} as const

const REGISTER_ACCEPTED_MESSAGE = 'Check your email to finish registration'
const ACCEPTED_STATUS = 202
const NO_CONTENT_STATUS = 204
const FORBIDDEN_STATUS = 403
const UNAUTHORIZED_STATUS = 401
const MS_PER_SECOND = 1000
const IP_EMAIL_KEY_SEPARATOR = '|'

type IpLimiter = Pick<RateLimiter, 'middleware' | 'hit'>

export type AuthRouterDeps = {
  register: (input: RegisterInput) => Promise<void>
  verifyEmail: (input: VerifyEmailInput) => Promise<AuthSession>
  login: (input: LoginInput) => Promise<AuthSession>
  refreshSession: (rawRefreshToken: string) => Promise<AuthSession>
  logout: (rawRefreshToken: string | undefined) => Promise<void>
  logoutAll: (teacherId: string) => Promise<void>
  getMe: (teacherId: string) => Promise<TeacherView>
  requireAuth: MiddlewareHandler
  clientIp: (c: Context) => string
  // Origin фронтенда: refresh и logout по cookie принимаются только с него (CSRF поверх SameSite)
  webOrigin: string
  limiters: {
    loginPerIp: IpLimiter
    loginPerIpEmail: IpLimiter
    registerPerIp: IpLimiter
    verifyEmailPerIp: IpLimiter
    sessionPerIp: IpLimiter
  }
}

function setRefreshCookie(c: Context, session: AuthSession): void {
  const maxAgeSeconds = Math.max(0, Math.floor((session.refreshTokenExpiresAt.getTime() - Date.now()) / MS_PER_SECOND))
  setCookie(c, REFRESH_COOKIE_NAME, session.refreshToken, { ...REFRESH_COOKIE_BASE_OPTIONS, maxAge: maxAgeSeconds })
}

// Те же path, secure и prefix: иначе браузер посчитает это другой cookie и не удалит
function clearRefreshCookie(c: Context): void {
  deleteCookie(c, REFRESH_COOKIE_NAME, REFRESH_COOKIE_BASE_OPTIONS)
}

function readRefreshCookie(c: Context): string | undefined {
  return getCookie(c, REFRESH_COOKIE_NAME, REFRESH_COOKIE_PREFIX)
}

// Сырой refresh-токен в тело ответа не попадает: только в httpOnly cookie
function sessionBody(session: AuthSession) {
  return { accessToken: session.accessToken, teacher: session.teacher }
}

export function makeAuthRouter(deps: AuthRouterDeps) {
  const router = new Hono()
  const byIp = deps.clientIp

  const requireWebOrigin: MiddlewareHandler = async (c, next) => {
    if (c.req.header('origin') !== deps.webOrigin) throw new AppError(FORBIDDEN_STATUS, 'Forbidden')
    await next()
  }

  router.post('/register', deps.limiters.registerPerIp.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, registerSchema)
    await deps.register(input)
    return c.json({ message: REGISTER_ACCEPTED_MESSAGE }, ACCEPTED_STATUS)
  })

  router.post('/verify-email', deps.limiters.verifyEmailPerIp.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, verifyEmailSchema)
    const session = await deps.verifyEmail(input)
    setRefreshCookie(c, session)
    return c.json(sessionBody(session))
  })

  router.post('/login', deps.limiters.loginPerIp.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, loginSchema)
    // Ключ после разбора тела: email уже нормализован emailSchema
    const decision = deps.limiters.loginPerIpEmail.hit(`${byIp(c)}${IP_EMAIL_KEY_SEPARATOR}${input.email}`)
    if (!decision.allowed) throw new RateLimitedError(decision.retryAfterSeconds)

    const session = await deps.login(input)
    setRefreshCookie(c, session)
    return c.json(sessionBody(session))
  })

  router.post('/refresh', deps.limiters.sessionPerIp.middleware(byIp), requireWebOrigin, async (c) => {
    const rawRefreshToken = readRefreshCookie(c)
    if (rawRefreshToken === undefined) throw new AppError(UNAUTHORIZED_STATUS, 'Unauthorized')

    try {
      const session = await deps.refreshSession(rawRefreshToken)
      setRefreshCookie(c, session)
      return c.json(sessionBody(session))
    } catch (error) {
      // Отказ сессии — cookie больше не нужна; при 503 и сбоях она остаётся, refresh можно повторить
      if (error instanceof AppError && error.status === UNAUTHORIZED_STATUS) clearRefreshCookie(c)
      throw error
    }
  })

  router.post('/logout', deps.limiters.sessionPerIp.middleware(byIp), requireWebOrigin, async (c) => {
    await deps.logout(readRefreshCookie(c))
    clearRefreshCookie(c)
    return c.body(null, NO_CONTENT_STATUS)
  })

  router.post('/logout-all', deps.limiters.sessionPerIp.middleware(byIp), deps.requireAuth, async (c) => {
    await deps.logoutAll(c.get('teacherId'))
    clearRefreshCookie(c)
    return c.body(null, NO_CONTENT_STATUS)
  })

  router.get('/me', deps.requireAuth, async (c) => {
    const teacher = await deps.getMe(c.get('teacherId'))
    return c.json({ teacher })
  })

  return router
}
