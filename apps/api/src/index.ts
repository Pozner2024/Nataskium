import { serve } from '@hono/node-server'
import { createApp, createAuthCleanup } from './app'
import { PRODUCTION_LIMITS, makePasswordHasher, makeUnconfiguredEmailSender, startCleanupSchedule } from './features/auth'
import { parseEnv, type Env } from './shared/config'
import { createPrismaClient } from './shared/infrastructure'

const API_HOST = '127.0.0.1'
const MS_PER_HOUR = 60 * 60 * 1000
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

// Без почты учитель не подтвердит регистрацию: в production такой сервер бесполезен. Снимается в части F (Resend)
if (env.NODE_ENV === 'production') {
  console.error('Email sending is not configured yet: refusing to start in production')
  process.exit(1)
}
const prisma = createPrismaClient(env.DATABASE_URL)
// До createApp: dummy-хэш для сверки при отсутствии учителя считается один раз при старте
const passwordHasher = await makePasswordHasher()
// Часть F заменит заглушку отправкой через Resend
const emailSender = makeUnconfiguredEmailSender()
// Всегда PRODUCTION_LIMITS, независимо от NODE_ENV: ослабленные лимиты передают только тесты через createApp
const app = createApp({ env, prisma, limits: PRODUCTION_LIMITS, passwordHasher, emailSender })

serve({ fetch: app.fetch, port: env.API_PORT, hostname: API_HOST }, ({ address, port }) => {
  console.log(`API started on http://${address}:${port}`)
  // После старта сервера: первый запуск сразу, дальше раз в CLEANUP_INTERVAL_MS
  startCleanupSchedule({ cleanup: createAuthCleanup(prisma), intervalMs: CLEANUP_INTERVAL_MS })
})
