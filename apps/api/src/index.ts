import { serve } from '@hono/node-server'
import { createApp, createAuthCleanup } from './app'
import {
  PASSWORD_RESET_TTL_MS,
  PENDING_REGISTRATION_TTL_MS,
  PRODUCTION_LIMITS,
  type EmailSender,
  type GoogleIdentityProvider,
  makeGoogleClient,
  makePasswordHasher,
  makeResendEmailSender,
  makeUnconfiguredEmailSender,
  startCleanupSchedule,
} from './features/auth'
import { parseEnv, type Env } from './shared/config'
import { createPrismaClient } from './shared/infrastructure'

const API_HOST = '127.0.0.1'
const MS_PER_HOUR = 60 * 60 * 1000
const VERIFICATION_LINK_TTL_HOURS = PENDING_REGISTRATION_TTL_MS / MS_PER_HOUR
const PASSWORD_RESET_LINK_TTL_HOURS = PASSWORD_RESET_TTL_MS / MS_PER_HOUR
// Регистрации живут 24 часа, refresh — 14 дней: раз в час истёкшие данные не задерживаются надолго
const CLEANUP_INTERVAL_MS = MS_PER_HOUR

function readEnv(): Env {
  try {
    return parseEnv(process.env)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid environment variables')
    process.exit(1)
  }
}

const env = readEnv()

// В production env.ts требует RESEND_API_KEY и EMAIL_FROM; вне production без них письма не уходят (заглушка)
function makeEmailSender(): EmailSender {
  if (env.RESEND_API_KEY === undefined || env.EMAIL_FROM === undefined) return makeUnconfiguredEmailSender()
  return makeResendEmailSender({
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
    webOrigin: env.WEB_ORIGIN,
    verificationLinkTtlHours: VERIFICATION_LINK_TTL_HOURS,
    passwordResetLinkTtlHours: PASSWORD_RESET_LINK_TTL_HOURS,
  })
}
const prisma = createPrismaClient(env.DATABASE_URL)
// До createApp: dummy-хэш для сверки при отсутствии учителя считается один раз при старте
const passwordHasher = await makePasswordHasher()
const emailSender = makeEmailSender()

// В production env.ts требует все три GOOGLE_*; вне production без них вход через Google просто не подключается
function makeGoogleIdentity(): GoogleIdentityProvider | null {
  if (env.GOOGLE_CLIENT_ID === undefined || env.GOOGLE_CLIENT_SECRET === undefined) return null
  if (env.GOOGLE_REDIRECT_URI === undefined) return null
  return makeGoogleClient({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  })
}

const googleIdentity = makeGoogleIdentity()
// Всегда PRODUCTION_LIMITS, независимо от NODE_ENV: ослабленные лимиты передают только тесты через createApp
const app = createApp({ env, prisma, limits: PRODUCTION_LIMITS, passwordHasher, emailSender, googleIdentity })

serve({ fetch: app.fetch, port: env.API_PORT, hostname: API_HOST }, ({ address, port }) => {
  console.log(`API started on http://${address}:${port}`)
  // После старта сервера: первый запуск сразу, дальше раз в CLEANUP_INTERVAL_MS
  startCleanupSchedule({ cleanup: createAuthCleanup(prisma), intervalMs: CLEANUP_INTERVAL_MS })
})
