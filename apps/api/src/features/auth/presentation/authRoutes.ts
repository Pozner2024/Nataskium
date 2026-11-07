// HTTP-интерфейс auth: разбор тела shared-схемами, лимиты, refresh-токен в httpOnly cookie.
// Маршруты монтируются на /api/auth (план 1.7): Caddy префикс не срезает, в dev — nitro.devProxy
import {
  type DeleteAccountInput,
  type ForgotPasswordInput,
  type GoogleLinkInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
  deleteAccountSchema,
  forgotPasswordSchema,
  googleLinkSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@nataskium/shared/schemas'
import { type Context, Hono, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { AppError, ExternalServiceError, RateLimitedError } from '../../../shared/errors'
import type { RateLimiter } from '../../../shared/middleware'
import { readJsonBody } from '../../../shared/utils'
import { z } from 'zod'
import type { GoogleSignInInput, GoogleSignInOutcome } from '../application/googleAuth'
import type { AuthSession, GoogleAuthorizationRequest, TeacherView } from '../types'
import { GOOGLE_SIGN_IN_DONE_PATH, LINK_GOOGLE_PATH, SIGN_IN_PATH } from '../webPaths'

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

// state, code_verifier и nonce одного входа через Google. SameSite=Lax обязателен: Google возвращает учителя
// cross-site редиректом, при Strict cookie на callback не пришла бы. 5 минут — на выбор аккаунта
const OAUTH_COOKIE_NAME = 'oauth'
// Секрет привязки Google: связывает ссылку /auth/link-google с браузером, который вернулся из Google.
// Strict: POST /google/link идёт со своей страницы; срок — как у записи привязки
const GOOGLE_LINK_COOKIE_NAME = 'google_link'
const GOOGLE_ROUTES_PATH = `${AUTH_ROUTES_BASE_PATH}/google`
const OAUTH_COOKIE_MAX_AGE_SECONDS = 5 * 60
const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: GOOGLE_ROUTES_PATH,
  prefix: REFRESH_COOKIE_PREFIX,
} as const
const GOOGLE_LINK_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
  path: GOOGLE_ROUTES_PATH,
  prefix: REFRESH_COOKIE_PREFIX,
} as const
const MAX_OAUTH_PARAM_LENGTH = 2048
const oauthCookieSchema = z.object({ state: z.string().min(1), codeVerifier: z.string().min(1), nonce: z.string().min(1) })
const callbackQuerySchema = z.object({
  code: z.string().min(1).max(MAX_OAUTH_PARAM_LENGTH),
  state: z.string().min(1).max(MAX_OAUTH_PARAM_LENGTH),
})
// Коды ошибок для страницы входа: без деталей, токенов и адресов
const GOOGLE_ERROR_CODES = {
  cancelled: 'google_cancelled',
  state: 'google_state',
  unavailable: 'google_unavailable',
  invalidToken: 'google_failed',
  invalidEmail: 'google_failed',
  unverifiedEmail: 'google_email_unverified',
  conflict: 'google_account_conflict',
} as const
const ERROR_QUERY_PARAM = 'error'
const TOKEN_FRAGMENT_PARAM = 'token'
const OAUTH_COOKIE_ENCODING = 'base64url'

const REGISTER_ACCEPTED_MESSAGE = 'Check your email to finish registration'
// Одна фраза для любого email: по ответу не понять, есть ли аккаунт
const RESET_REQUESTED_MESSAGE = 'If an account with a password exists for this email, we sent a reset link'
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
  requestPasswordReset: (input: ForgotPasswordInput) => Promise<void>
  resetPassword: (input: ResetPasswordInput) => Promise<void>
  deleteAccount: (teacherId: string, input: DeleteAccountInput) => Promise<void>
  // null — Google не настроен (вне production без GOOGLE_*): маршруты /google/* не подключаются
  google: {
    createAuthorizationRequest: () => GoogleAuthorizationRequest
    signIn: (input: GoogleSignInInput) => Promise<GoogleSignInOutcome>
    link: (input: GoogleLinkInput, linkSecret: string | undefined) => Promise<AuthSession>
    // Срок cookie секрета привязки — как у записи (GOOGLE_LINK_TTL_MS)
    linkTtlSeconds: number
  } | null
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
    forgotPasswordPerIp: IpLimiter
    resetPasswordPerIp: IpLimiter
    googleStartPerIp: IpLimiter
    googleCallbackPerIp: IpLimiter
    googleLinkPerIp: IpLimiter
    deleteAccountPerIp: IpLimiter
  }
}

// Битая или подделанная cookie — то же, что её отсутствие: ошибка state, а не 500
function parseOauthCookie(raw: string | undefined): unknown {
  if (raw === undefined) return null
  try {
    return JSON.parse(Buffer.from(raw, OAUTH_COOKIE_ENCODING).toString())
  } catch {
    return null
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

  router.post('/forgot-password', deps.limiters.forgotPasswordPerIp.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, forgotPasswordSchema)
    // Лимит писем по email — внутри use-case, по нормализованному адресу и одинаково для любого email
    await deps.requestPasswordReset(input)
    return c.json({ message: RESET_REQUESTED_MESSAGE }, ACCEPTED_STATUS)
  })

  router.post('/reset-password', deps.limiters.resetPasswordPerIp.middleware(byIp), async (c) => {
    const input = await readJsonBody(c, resetPasswordSchema)
    await deps.resetPassword(input)
    // Все сессии учителя уже удалены: cookie этого браузера, если была, тоже недействительна
    clearRefreshCookie(c)
    return c.body(null, NO_CONTENT_STATUS)
  })

  // Пароль сверяется в use-case (лимит неудач по email — там же). Сессий учителя больше нет: стираем cookie
  // этого браузера, включая секрет незавершённой привязки Google
  router.post('/delete-account', deps.limiters.deleteAccountPerIp.middleware(byIp), deps.requireAuth, async (c) => {
    const input = await readJsonBody(c, deleteAccountSchema)
    await deps.deleteAccount(c.get('teacherId'), input)
    clearRefreshCookie(c)
    deleteCookie(c, GOOGLE_LINK_COOKIE_NAME, GOOGLE_LINK_COOKIE_OPTIONS)
    return c.body(null, NO_CONTENT_STATUS)
  })

  if (deps.google !== null) {
    const google = deps.google
    const signInError = (c: Context, code: string) => {
      const url = new URL(`${deps.webOrigin}${SIGN_IN_PATH}`)
      url.searchParams.set(ERROR_QUERY_PARAM, code)
      return c.redirect(url.toString())
    }

    router.get('/google/start', deps.limiters.googleStartPerIp.middleware(byIp), (c) => {
      const request = google.createAuthorizationRequest()
      const value = Buffer.from(
        JSON.stringify({ state: request.state, codeVerifier: request.codeVerifier, nonce: request.nonce }),
      ).toString(OAUTH_COOKIE_ENCODING)
      setCookie(c, OAUTH_COOKIE_NAME, value, { ...OAUTH_COOKIE_OPTIONS, maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS })
      return c.redirect(request.url)
    })

    router.get('/google/callback', deps.limiters.googleCallbackPerIp.middleware(byIp), async (c) => {
      const rawCookie = getCookie(c, OAUTH_COOKIE_NAME, REFRESH_COOKIE_PREFIX)
      // Одноразовая: и при успехе, и при любой ошибке
      deleteCookie(c, OAUTH_COOKIE_NAME, OAUTH_COOKIE_OPTIONS)

      // Учитель нажал «Отмена» или Google вернул ошибку
      if (c.req.query(ERROR_QUERY_PARAM) !== undefined) return signInError(c, GOOGLE_ERROR_CODES.cancelled)

      const query = callbackQuerySchema.safeParse(c.req.query())
      const cookie = oauthCookieSchema.safeParse(parseOauthCookie(rawCookie))
      // state из cookie этого браузера: ответ, начатый в чужом браузере (login CSRF), не примется
      if (!query.success || !cookie.success || query.data.state !== cookie.data.state) {
        return signInError(c, GOOGLE_ERROR_CODES.state)
      }

      try {
        const outcome = await google.signIn({
          code: query.data.code,
          codeVerifier: cookie.data.codeVerifier,
          nonce: cookie.data.nonce,
        })
        if (!outcome.ok) return signInError(c, GOOGLE_ERROR_CODES[outcome.reason])

        // Учитель с этим email уже есть без Google: сначала ввод пароля. Токен — во фрагменте, как в письмах
        if (outcome.kind === 'linkRequired') {
          setCookie(c, GOOGLE_LINK_COOKIE_NAME, outcome.linkSecret, {
            ...GOOGLE_LINK_COOKIE_OPTIONS,
            maxAge: google.linkTtlSeconds,
          })
          const token = encodeURIComponent(outcome.linkToken)
          return c.redirect(`${deps.webOrigin}${LINK_GOOGLE_PATH}#${TOKEN_FRAGMENT_PARAM}=${token}`)
        }

        setRefreshCookie(c, outcome.session)
        // Access-токен в URL не передаём: страница получит его через /api/auth/refresh
        return c.redirect(`${deps.webOrigin}${GOOGLE_SIGN_IN_DONE_PATH}`)
      } catch (error) {
        // Учителя удалили, пока шёл вход (sessionInvalid из issueSession): не сбой Google, а обычный отказ
        if (error instanceof AppError && error.status === UNAUTHORIZED_STATUS) {
          return signInError(c, GOOGLE_ERROR_CODES.invalidToken)
        }
        // Только тип: в ошибках Google и сети бывают параметры запроса
        const status = error instanceof ExternalServiceError ? error.status : undefined
        console.error('Google sign-in failed', { errorType: error instanceof Error ? error.name : typeof error, status })
        return signInError(c, GOOGLE_ERROR_CODES.unavailable)
      }
    })
  }

  if (deps.google !== null) {
    const google = deps.google
    // Лимит неудач по email — внутри use-case (email учителя берётся из записи привязки)
    router.post('/google/link', deps.limiters.googleLinkPerIp.middleware(byIp), async (c) => {
      const input = await readJsonBody(c, googleLinkSchema)
      const session = await google.link(input, getCookie(c, GOOGLE_LINK_COOKIE_NAME, REFRESH_COOKIE_PREFIX))
      // Привязка завершена: секрет больше не нужен. При ошибке cookie остаётся — пароль можно ввести снова
      deleteCookie(c, GOOGLE_LINK_COOKIE_NAME, GOOGLE_LINK_COOKIE_OPTIONS)
      setRefreshCookie(c, session)
      return c.json(sessionBody(session))
    })
  }

  router.get('/me', deps.requireAuth, async (c) => {
    const teacher = await deps.getMe(c.get('teacherId'))
    return c.json({ teacher })
  })

  return router
}
