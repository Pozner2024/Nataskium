import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const API_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CHILD_TIMEOUT_MS = 10_000
const TEST_TIMEOUT_MS = 15_000
// Порт для дочернего процесса: при поломке проверки сервер успел бы на нём запуститься
const CHILD_PORT = '3997'
const REFUSAL = 'Email sending is not configured yet: refusing to start in production'
// Значения, которых не должно быть в выводе: секреты и пароль базы
const DB_PASSWORD = 'qa-startup-db-password'
const JWT_SECRET = 'qa-startup-jwt-secret-0123456789abcdef'
const HMAC_SECRET = 'qa-startup-hmac-secret-0123456789abcdef'

// Полное верное окружение production: падение может быть только из-за отсутствия почты
const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  API_PORT: CHILD_PORT,
  DATABASE_URL: `postgresql://qa_user:${DB_PASSWORD}@db.example.test:5432/qa_db`,
  JWT_SECRET,
  HMAC_SECRET,
  WEB_ORIGIN: 'https://nataskium.example',
  TRUSTED_PROXY_IPS: '172.18.0.2',
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
    expect(child.stderr).toContain(REFUSAL)
    expect(child.stdout).not.toContain('API started')
    for (const secret of [DB_PASSWORD, JWT_SECRET, HMAC_SECRET]) {
      expect(child.stdout).not.toContain(secret)
      expect(child.stderr).not.toContain(secret)
    }
  }, TEST_TIMEOUT_MS)
})
