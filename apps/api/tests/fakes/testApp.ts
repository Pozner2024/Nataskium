import { createApp } from '../../src/app'
import { type AuthLimits, type EmailSender, type GoogleIdentityProvider, PRODUCTION_LIMITS, makePasswordHasher } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { type Env, parseEnv } from '../../src/shared/config'
import { createPrismaClient } from '../../src/shared/infrastructure'
import { makeRecordingEmailSender } from './recordingEmailSender'

export const TEST_WEB_ORIGIN = 'http://localhost:3000'
export const TEST_CLIENT_IP = '127.0.0.1'
// Выдуманные секреты и адрес: unit-тесты к базе не подключаются, Prisma не открывает соединение без запроса
const UNIT_DATABASE_URL = 'postgresql://qa_user:qa-fake-password@127.0.0.1:1/qa_unit_test'

// Числа как в production: тесты проверяют настоящие лимиты, ослабляют только то, что нужно сценарию
export const TEST_LIMITS: AuthLimits = PRODUCTION_LIMITS

export const TEST_ENV: Env = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: UNIT_DATABASE_URL,
  JWT_SECRET: 'qa-fake-jwt-secret-0123456789abcdef',
  HMAC_SECRET: 'qa-fake-hmac-secret-0123456789abcdef',
  WEB_ORIGIN: TEST_WEB_ORIGIN,
})

// argon2 c dummy-хэшем считается один раз на файл: createApp в тестах вызывается синхронно и часто
const sharedHasher = await makePasswordHasher()
let unitPrisma: PrismaClient | undefined

export type TestAppOptions = {
  env?: Partial<Record<keyof Env, string>>
  prisma?: PrismaClient
  limits?: Partial<AuthLimits>
  emailSender?: EmailSender
  // null — Google не настроен: маршруты /api/auth/google/* не подключаются
  googleIdentity?: GoogleIdentityProvider | null
}

export function createTestApp(options: TestAppOptions = {}) {
  const env = options.env === undefined ? TEST_ENV : parseEnv({ ...envSource(TEST_ENV), ...options.env })
  unitPrisma ??= createPrismaClient(UNIT_DATABASE_URL)
  return createApp({
    env,
    prisma: options.prisma ?? unitPrisma,
    limits: { ...TEST_LIMITS, ...options.limits },
    passwordHasher: sharedHasher,
    emailSender: options.emailSender ?? makeRecordingEmailSender().sender,
    googleIdentity: options.googleIdentity ?? null,
  })
}

function envSource(env: Env): Record<string, string> {
  return {
    NODE_ENV: env.NODE_ENV,
    API_PORT: String(env.API_PORT),
    DATABASE_URL: env.DATABASE_URL,
    JWT_SECRET: env.JWT_SECRET,
    HMAC_SECRET: env.HMAC_SECRET,
    WEB_ORIGIN: env.WEB_ORIGIN,
    TRUSTED_PROXY_IPS: env.TRUSTED_PROXY_IPS.join(','),
  }
}

// Адрес сокета клиента для app.request: без него маршруты с лимитом по IP отвечают 500
export function fromIp(remoteAddress: string = TEST_CLIENT_IP) {
  return { incoming: { socket: { remoteAddress } } }
}
