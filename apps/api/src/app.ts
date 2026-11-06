import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import type { PrismaClient } from './generated/prisma/client'
import {
  AUTH_ROUTES_BASE_PATH,
  type AuthLimits,
  type EmailSender,
  type PasswordHasher,
  makeAuthLimiters,
  makeAuthRouter,
  makeCleanupExpiredAuthRecords,
  makeGetMe,
  makeLogin,
  makeLogout,
  makeLogoutAll,
  makePendingRegistrationRepository,
  makeRefreshSession,
  makeRefreshTokenRepository,
  makeRegister,
  makeTeacherRepository,
  makeTokenService,
  makeVerifyEmail,
} from './features/auth'
import type { Env } from './shared/config'
import { AppError } from './shared/errors'
import {
  errorHandler,
  makeClientIpResolver,
  makeRequireAuth,
  nonErrorHandler,
  notFoundHandler,
} from './shared/middleware'

const MAX_BODY_SIZE_BYTES = 100 * 1024
const PAYLOAD_TOO_LARGE_STATUS = 413
const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE']
const CORS_ALLOWED_HEADERS = ['Content-Type', 'Authorization']

export type AppDeps = {
  env: Env
  prisma: PrismaClient
  limits: AuthLimits
  // Асинхронная фабрика (dummy-хэш при старте) — создаётся до createApp
  passwordHasher: PasswordHasher
  // Параметром, а не из env здесь: тесты передают фейк и читают из него токен подтверждения
  emailSender: EmailSender
}

// Отдельно от createApp: расписание запускает только index.ts, тесты очистку не стартуют
export function createAuthCleanup(prisma: PrismaClient): () => Promise<void> {
  return makeCleanupExpiredAuthRecords({
    refreshTokens: makeRefreshTokenRepository(prisma),
    pendingRegistrations: makePendingRegistrationRepository(prisma),
    now: () => new Date(),
  })
}

// Composition root: единственное место, где application связывается с infrastructure
export function createApp({ env, prisma, limits, passwordHasher, emailSender }: AppDeps) {
  const app = new Hono()

  // Первым: ответ на preflight и заголовки CORS нужны даже на ошибках. Только origin фронтенда, без '*'
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      allowMethods: CORS_ALLOWED_METHODS,
      allowHeaders: CORS_ALLOWED_HEADERS,
    }),
  )
  app.use(secureHeaders())
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_SIZE_BYTES,
      onError: () => {
        throw new AppError(PAYLOAD_TOO_LARGE_STATUS, 'Payload Too Large')
      },
    }),
  )
  // Последним перед маршрутами: ловит сбой самого errorHandler
  app.use(nonErrorHandler)

  app.onError(errorHandler)
  app.notFound(notFoundHandler)

  app.get('/health', (c) => c.json({ status: 'ok' }))

  // Auth
  const teachers = makeTeacherRepository(prisma)
  const refreshTokens = makeRefreshTokenRepository(prisma)
  const pendingRegistrations = makePendingRegistrationRepository(prisma)
  const tokens = makeTokenService({ jwtSecret: env.JWT_SECRET, hmacSecret: env.HMAC_SECRET })
  const limiters = makeAuthLimiters(limits)
  const now = () => new Date()
  const sessionDeps = { refreshTokens, tokens, now }

  app.route(
    AUTH_ROUTES_BASE_PATH,
    makeAuthRouter({
      register: makeRegister({
        teachers,
        pendingRegistrations,
        hasher: passwordHasher,
        tokens,
        emailSender,
        registrationEmailQuota: limiters.registrationEmailQuota,
        now,
      }),
      verifyEmail: makeVerifyEmail({
        ...sessionDeps,
        pendingRegistrations,
        hasher: passwordHasher,
        failureLimiter: limiters.failureLimiter,
      }),
      login: makeLogin({ ...sessionDeps, teachers, hasher: passwordHasher, failureLimiter: limiters.failureLimiter }),
      refreshSession: makeRefreshSession({ ...sessionDeps, teachers }),
      logout: makeLogout({ refreshTokens, tokens }),
      logoutAll: makeLogoutAll({ refreshTokens }),
      getMe: makeGetMe({ teachers }),
      requireAuth: makeRequireAuth(tokens.verifyAccessToken),
      clientIp: makeClientIpResolver(env.TRUSTED_PROXY_IPS),
      webOrigin: env.WEB_ORIGIN,
      limiters,
    }),
  )

  return app
}
