import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const API_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CHILD_TIMEOUT_MS = 10_000
const TEST_TIMEOUT_MS = 15_000
// Порт для дочернего процесса: при поломке проверки сервер успел бы на нём запуститься
const CHILD_PORT = '3997'
// Без почты учитель не подтвердит регистрацию: env.ts не пускает такой сервер в production
const KEY_REQUIRED = 'RESEND_API_KEY: is required in production'
const KEY_WHITESPACE = 'RESEND_API_KEY: must not start or end with whitespace'
const TEST_DOMAIN = 'EMAIL_FROM: must not use the resend.dev test domain in production'
const RESEND_KEY = 're_qa_startup_key_0123456789abcdef'
// Значения, которых не должно быть в выводе: секреты и пароль базы
const DB_PASSWORD = 'qa-startup-db-password'
const JWT_SECRET = 'qa-startup-jwt-secret-0123456789abcdef'
const HMAC_SECRET = 'qa-startup-hmac-secret-0123456789abcdef'

// Верное окружение production без почты: падение может быть только из-за неё
const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  API_PORT: CHILD_PORT,
  DATABASE_URL: `postgresql://qa_user:${DB_PASSWORD}@db.example.test:5432/qa_db`,
  JWT_SECRET,
  HMAC_SECRET,
  WEB_ORIGIN: 'https://nataskium.example',
  TRUSTED_PROXY_IPS: '172.18.0.2',
  // undefined убирает переменные, если они заданы в оболочке разработчика
  RESEND_API_KEY: undefined,
  EMAIL_FROM: undefined,
}

function runServer(env: Record<string, string | undefined>) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: API_ROOT,
    // undefined убирает переменную, унаследованную из окружения разработчика
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: CHILD_TIMEOUT_MS,
  })
}

describe('запуск в production без почты', () => {
  it.each([
    ['NODE_ENV=production', PRODUCTION_ENV],
    ['NODE_ENV не задан: по умолчанию production', { ...PRODUCTION_ENV, NODE_ENV: undefined }],
  ])('%s — выход с кодом 1, сервер не стартует, секретов нет в выводе', (_name, env) => {
    const child = runServer(env)

    expect(child.status).toBe(1)
    expect(child.stderr).toContain('Invalid environment variables')
    expect(child.stderr).toContain(KEY_REQUIRED)
    expect(child.stdout).not.toContain('API started')
    for (const secret of [DB_PASSWORD, JWT_SECRET, HMAC_SECRET]) {
      expect(child.stdout).not.toContain(secret)
      expect(child.stderr).not.toContain(secret)
    }
  }, TEST_TIMEOUT_MS)
})

describe('запуск в production с неверной почтой', () => {
  it.each([
    ['ключ с переводом строки', { RESEND_API_KEY: `${RESEND_KEY}\n`, EMAIL_FROM: 'noreply@nataskium.example' }, KEY_WHITESPACE],
    ['тестовый домен Resend', { RESEND_API_KEY: RESEND_KEY, EMAIL_FROM: 'onboarding@resend.dev' }, TEST_DOMAIN],
  ])('%s — выход с кодом 1, ключа нет в выводе', (_name, email, problem) => {
    const child = runServer({ ...PRODUCTION_ENV, ...email })

    expect(child.status).toBe(1)
    expect(child.stderr).toContain(problem)
    expect(child.stdout).not.toContain('API started')
    expect(child.stdout).not.toContain(RESEND_KEY)
    expect(child.stderr).not.toContain(RESEND_KEY)
  }, TEST_TIMEOUT_MS)
})
