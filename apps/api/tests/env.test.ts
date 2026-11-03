import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/shared/config'

const DEFAULT_ENV = { NODE_ENV: 'production', API_PORT: 3001 }
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
  it('для пустого окружения отдаёт значения по умолчанию', () => {
    expect(parseEnv({})).toEqual(DEFAULT_ENV)
  })

  it('undefined считается отсутствующим значением', () => {
    expect(parseEnv({ NODE_ENV: undefined, API_PORT: undefined })).toEqual(DEFAULT_ENV)
  })

  it.each(['development', 'production', 'test'])('NODE_ENV %s', (value) => {
    expect(parseEnv({ NODE_ENV: value }).NODE_ENV).toBe(value)
  })

  it.each([
    ['1', 1],
    ['65535', 65535],
    ['3002', 3002],
    ['03002', 3002],
  ])('API_PORT %s → %i', (value, expected) => {
    expect(parseEnv({ API_PORT: value }).API_PORT).toBe(expected)
  })

  it('посторонние переменные не попадают в результат', () => {
    expect(parseEnv({ NODE_ENV: 'test', API_PORT: '3002', DATABASE_URL: SECRET, PATH: '/bin' })).toEqual({
      NODE_ENV: 'test',
      API_PORT: 3002,
    })
  })

  it('не мутирует входной объект', () => {
    const source = { API_PORT: '03002', EXTRA: SECRET }

    parseEnv(source)

    expect(source).toEqual({ API_PORT: '03002', EXTRA: SECRET })
  })

  it('работает с замороженным объектом', () => {
    expect(parseEnv(Object.freeze({ API_PORT: '3002' })).API_PORT).toBe(3002)
  })
})

describe('parseEnv: отклоняемые значения', () => {
  it.each(['0', '65536', '', ' 3002 ', '3002\n', '1e3', '0x10', '-1', '+1', '3002.5', '٣٠٠٢', SECRET])(
    'API_PORT %j',
    (value) => {
      expect(parseError({ API_PORT: value }).message).toBe(`Invalid environment variables:\n${PORT_PROBLEM}`)
    },
  )

  it.each(['', 'Development', 'staging', ' production', SECRET])('NODE_ENV %j', (value) => {
    expect(parseError({ NODE_ENV: value }).message).toBe(`Invalid environment variables:\n${NODE_ENV_PROBLEM}`)
  })

  it('перечисляет все неверные переменные', () => {
    expect(parseError({ NODE_ENV: 'staging', API_PORT: '0' }).message).toBe(
      `Invalid environment variables:\n${NODE_ENV_PROBLEM}\n${PORT_PROBLEM}`,
    )
  })

  it('бросает обычный Error без cause и без ZodError', () => {
    const error = parseError({ API_PORT: '0' })

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
    const error = parseError(source)
    const values = Object.values(source)

    for (const value of values) {
      expect(error.message).not.toContain(value)
      expect(inspect(error)).not.toContain(value)
    }
  })
})

describe('запуск сервера при неверном окружении', () => {
  it.each([
    ['NODE_ENV', { NODE_ENV: SECRET, API_PORT: CHILD_PORT }],
    ['API_PORT', { NODE_ENV: 'production', API_PORT: SECRET }],
  ])('%s: выход с кодом 1, сервер не стартует, значения нет в выводе', (name, env) => {
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: API_ROOT,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      timeout: CHILD_TIMEOUT_MS,
    })

    expect(child.status).toBe(1)
    expect(child.stderr).toContain(name)
    expect(child.stdout).not.toContain('API started')
    expect(child.stdout).not.toContain(SECRET)
    expect(child.stderr).not.toContain(SECRET)
  }, TEST_TIMEOUT_MS)
})
