import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/shared/config'

// Выдуманный адрес: настоящий пароль из .env в тестах не используется
const TEST_DATABASE_URL = 'postgresql://qa_user:qa-fake-password@db.example.test:5432/qa_db'
const VALID = { DATABASE_URL: TEST_DATABASE_URL }
const DEFAULT_ENV = { NODE_ENV: 'production', API_PORT: 3001, DATABASE_URL: TEST_DATABASE_URL }
const DATABASE_URL_REQUIRED = '  DATABASE_URL: is required'
const DATABASE_URL_PROBLEM = '  DATABASE_URL: must be a postgresql:// or postgres:// URL'
const DB_PASSWORD = 'secret-pass-123'
const PORT_PROBLEM = '  API_PORT: must be an integer from 1 to 65535'
const NODE_ENV_PROBLEM = '  NODE_ENV: must be one of: development, production, test'
const SECRET = 'secret-abc-123'

const API_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CHILD_TIMEOUT_MS = 10_000
const TEST_TIMEOUT_MS = 15_000
// Порт для дочернего процесса: при поломке проверки сервер успел бы на нём запуститься
const CHILD_PORT = '3998'

function parseError(source: Record<string, string | undefined>): Error {
  try {
    parseEnv(source)
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error('parseEnv threw a non-Error', { cause: error })
  }
  throw new Error('parseEnv did not throw')
}

describe('parseEnv: допустимые значения', () => {
  it('без NODE_ENV и API_PORT отдаёт значения по умолчанию', () => {
    expect(parseEnv(VALID)).toEqual(DEFAULT_ENV)
  })

  it('undefined считается отсутствующим значением', () => {
    expect(parseEnv({ ...VALID, NODE_ENV: undefined, API_PORT: undefined })).toEqual(DEFAULT_ENV)
  })

  it.each(['development', 'production', 'test'])('NODE_ENV %s', (value) => {
    expect(parseEnv({ ...VALID, NODE_ENV: value }).NODE_ENV).toBe(value)
  })

  it.each([
    ['1', 1],
    ['65535', 65535],
    ['3002', 3002],
    ['03002', 3002],
  ])('API_PORT %s → %i', (value, expected) => {
    expect(parseEnv({ ...VALID, API_PORT: value }).API_PORT).toBe(expected)
  })

  it('посторонние переменные не попадают в результат', () => {
    expect(parseEnv({ ...VALID, NODE_ENV: 'test', API_PORT: '3002', SESSION_SECRET: SECRET, PATH: '/bin' })).toEqual({
      NODE_ENV: 'test',
      API_PORT: 3002,
      DATABASE_URL: TEST_DATABASE_URL,
    })
  })

  it('не мутирует входной объект', () => {
    const source = { ...VALID, API_PORT: '03002', EXTRA: SECRET }

    parseEnv(source)

    expect(source).toEqual({ ...VALID, API_PORT: '03002', EXTRA: SECRET })
  })

  it('работает с замороженным объектом', () => {
    expect(parseEnv(Object.freeze({ ...VALID, API_PORT: '3002' })).API_PORT).toBe(3002)
  })
})

describe('parseEnv: отклоняемые значения', () => {
  it.each(['0', '65536', '', ' 3002 ', '3002\n', '1e3', '0x10', '-1', '+1', '3002.5', '٣٠٠٢', SECRET])(
    'API_PORT %j',
    (value) => {
      expect(parseError({ ...VALID, API_PORT: value }).message).toBe(`Invalid environment variables:\n${PORT_PROBLEM}`)
    },
  )

  it.each(['', 'Development', 'staging', ' production', SECRET])('NODE_ENV %j', (value) => {
    expect(parseError({ ...VALID, NODE_ENV: value }).message).toBe(`Invalid environment variables:\n${NODE_ENV_PROBLEM}`)
  })

  it('перечисляет все неверные переменные', () => {
    expect(parseError({ NODE_ENV: 'staging', API_PORT: '0' }).message).toBe(
      `Invalid environment variables:\n${NODE_ENV_PROBLEM}\n${PORT_PROBLEM}\n${DATABASE_URL_REQUIRED}`,
    )
  })

  it('бросает обычный Error без cause и без ZodError', () => {
    const error = parseError({ ...VALID, API_PORT: '0' })

    expect(Object.getPrototypeOf(error)).toBe(Error.prototype)
    expect(error.cause).toBeUndefined()
    expect(Object.keys(error)).toEqual([])
  })

  it.each([
    ['API_PORT', { API_PORT: SECRET }],
    ['API_PORT за пределами диапазона', { API_PORT: '99999123' }],
    ['NODE_ENV', { NODE_ENV: SECRET }],
    ['обе переменные', { NODE_ENV: SECRET, API_PORT: `${SECRET}-port` }],
  ])('в ошибке нет исходного значения: %s', (_name, source) => {
    const error = parseError({ ...VALID, ...source })
    const values = Object.values(source)

    for (const value of values) {
      expect(error.message).not.toContain(value)
      expect(inspect(error)).not.toContain(value)
    }
  })
})

describe('parseEnv: DATABASE_URL', () => {
  it('обязателен', () => {
    expect(parseError({}).message).toBe(`Invalid environment variables:\n${DATABASE_URL_REQUIRED}`)
  })

  it('undefined считается отсутствием', () => {
    expect(parseError({ DATABASE_URL: undefined }).message).toBe(`Invalid environment variables:\n${DATABASE_URL_REQUIRED}`)
  })

  it.each([
    TEST_DATABASE_URL,
    'postgres://qa_user:qa-fake-password@db.example.test:5432/qa_db',
    'postgresql://db.example.test/qa_db',
    'postgresql://qa_user:qa-fake-password@127.0.0.1:5432/qa_db?sslmode=require',
    'postgresql://[::1]:5432/qa_db',
    'POSTGRESQL://DB.example.test/qa_db',
  ])('принимает и возвращает как есть: %s', (value) => {
    expect(parseEnv({ DATABASE_URL: value }).DATABASE_URL).toBe(value)
  })

  it.each([
    '',
    'postgresql:',
    'postgresql://',
    'postgresql:///db',
    'postgresql://:5432/db',
    'postgresql:/db.example.test/db',
    'postgresqlx://db.example.test/db',
    'xpostgres://db.example.test/db',
    'mysql://qa_user:qa-fake-password@db.example.test/db',
    'https://db.example.test/db',
    'postgresql://db.example.test:99999/db',
    'postgresql://db example.test/db',
    'not a url at all',
  ])('отклоняет %j', (value) => {
    expect(parseError({ DATABASE_URL: value }).message).toBe(`Invalid environment variables:\n${DATABASE_URL_PROBLEM}`)
  })

  it.each([
    ['пустой хост', `postgresql://qa_user:${DB_PASSWORD}@/qa_db`],
    ['чужая схема', `mysql://qa_user:${DB_PASSWORD}@db.example.test/qa_db`],
    ['порт 99999', `postgresql://qa_user:${DB_PASSWORD}@db.example.test:99999/qa_db`],
    ['мусор', `garbage ${DB_PASSWORD}`],
  ])('пароля из адреса нет в ошибке: %s', (_name, value) => {
    const error = parseError({ DATABASE_URL: value })

    expect(error.message).not.toContain(DB_PASSWORD)
    expect(inspect(error)).not.toContain(DB_PASSWORD)
  })
})

describe('запуск сервера при неверном окружении', () => {
  function runServer(env: Record<string, string | undefined>) {
    return spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: API_ROOT,
      // undefined убирает переменную, унаследованную из окружения разработчика
      env: { ...process.env, ...env },
      encoding: 'utf8',
      timeout: CHILD_TIMEOUT_MS,
    })
  }

  it.each([
    ['NODE_ENV', SECRET, { ...VALID, NODE_ENV: SECRET, API_PORT: CHILD_PORT }],
    ['API_PORT', SECRET, { ...VALID, NODE_ENV: 'production', API_PORT: SECRET }],
    ['DATABASE_URL', DB_PASSWORD, { NODE_ENV: 'production', API_PORT: CHILD_PORT, DATABASE_URL: `mysql://qa_user:${DB_PASSWORD}@db.example.test/qa_db` }],
  ])('%s: выход с кодом 1, сервер не стартует, значения нет в выводе', (name, secret, env) => {
    const child = runServer(env)

    expect(child.status).toBe(1)
    expect(child.stderr).toContain(name)
    expect(child.stdout).not.toContain('API started')
    expect(child.stdout).not.toContain(secret)
    expect(child.stderr).not.toContain(secret)
  }, TEST_TIMEOUT_MS)

  it('без DATABASE_URL: выход с кодом 1 и понятная причина', () => {
    const child = runServer({ NODE_ENV: 'production', API_PORT: CHILD_PORT, DATABASE_URL: undefined })

    expect(child.status).toBe(1)
    expect(child.stderr).toContain(DATABASE_URL_REQUIRED.trim())
    expect(child.stdout).not.toContain('API started')
  }, TEST_TIMEOUT_MS)
})
