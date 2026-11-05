import { afterEach, describe, expect, it, vi } from 'vitest'
import { TestDatabaseRefusedError, assertTestDatabaseUrl, clearPostgresEnv } from './integration/testDatabaseUrl'

// Выдуманные адреса: тест не подключается к базе
const TEST_PASSWORD = 'qa-fake-test-password'
const VALID_URL = `postgresql://nataskium_test:${TEST_PASSWORD}@127.0.0.1:5433/nataskium_test`
const DEV_URL = 'postgresql://nataskium:qa-fake-dev-password@127.0.0.1:5432/nataskium'
const REFUSAL_PREFIX = 'Refusing to use the database for integration tests: '

function refusalOf(url: string, devUrl?: string): string {
  try {
    assertTestDatabaseUrl(url, devUrl)
  } catch (error) {
    if (error instanceof Error) return error.message
    throw new Error('assertTestDatabaseUrl threw a non-Error', { cause: error })
  }
  throw new Error('assertTestDatabaseUrl did not refuse')
}

function urlWith(parts: { host?: string; port?: string; name?: string; protocol?: string }) {
  const { host = '127.0.0.1', port = ':5433', name = 'nataskium_test', protocol = 'postgresql' } = parts
  return `${protocol}://nataskium_test:${TEST_PASSWORD}@${host}${port}/${name}`
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('assertTestDatabaseUrl: допустимые адреса', () => {
  it.each([
    ['127.0.0.1', VALID_URL],
    ['localhost', urlWith({ host: 'localhost' })],
    ['IPv6 ::1', urlWith({ host: '[::1]' })],
    ['схема postgres://', urlWith({ protocol: 'postgres' })],
    ['другое имя с _test', urlWith({ name: 'qa_other_test' })],
    ['_test в percent-кодировке', urlWith({ name: 'nataskium%5Ftest' })],
    ['без пароля', 'postgresql://nataskium_test@127.0.0.1:5433/nataskium_test'],
  ])('%s', (_name, url) => {
    expect(() => assertTestDatabaseUrl(url, DEV_URL)).not.toThrow()
  })

  it('без dev-адреса тоже принимает', () => {
    expect(() => assertTestDatabaseUrl(VALID_URL)).not.toThrow()
  })

  it('нечитаемый dev-адрес не мешает проверке', () => {
    expect(() => assertTestDatabaseUrl(VALID_URL, 'not a url')).not.toThrow()
  })

  it.each(['development', 'test', undefined])('NODE_ENV=%s допустим', (nodeEnv) => {
    vi.stubEnv('NODE_ENV', nodeEnv)

    expect(() => assertTestDatabaseUrl(VALID_URL, DEV_URL)).not.toThrow()
  })
})

describe('assertTestDatabaseUrl: отказ', () => {
  it.each([
    ['порт dev-базы 5432', urlWith({ port: ':5432' })],
    ['порт по умолчанию', urlWith({ port: '' })],
    ['чужой порт', urlWith({ port: ':15433' })],
  ])('порт: %s', (_name, url) => {
    expect(refusalOf(url)).toBe(`${REFUSAL_PREFIX}port is not 5433`)
  })

  it.each([
    ['без _test', 'nataskium'],
    ['_test в середине', 'nataskium_test_copy'],
    ['_TEST в верхнем регистре', 'nataskium_TEST'],
    ['дефис вместо подчёркивания', 'nataskium-test'],
    ['test без подчёркивания', 'nataskiumtest'],
    ['пустое имя', ''],
    ['_test в пути, но не в имени', 'nataskium_test/x'],
  ])('имя базы: %s', (_name, name) => {
    expect(refusalOf(urlWith({ name }))).toBe(`${REFUSAL_PREFIX}database name does not end with _test`)
  })

  it.each([
    ['удалённый хост', 'db.example.com'],
    ['адрес в сети', '10.0.0.5'],
    ['127.0.0.2', '127.0.0.2'],
    ['0.0.0.0', '0.0.0.0'],
    ['localhost как поддомен', 'localhost.example.com'],
    // postgresql: — не special-схема URL: регистр хоста не приводится, и отказ безопасен
    ['LOCALHOST в верхнем регистре', 'LOCALHOST'],
  ])('хост: %s', (_name, host) => {
    expect(refusalOf(urlWith({ host }))).toBe(`${REFUSAL_PREFIX}host is not local`)
  })

  it.each([
    ['mysql', urlWith({ protocol: 'mysql' })],
    ['https', urlWith({ protocol: 'https' })],
    ['postgresqlx', urlWith({ protocol: 'postgresqlx' })],
  ])('схема: %s', (_name, url) => {
    expect(refusalOf(url)).toBe(`${REFUSAL_PREFIX}DATABASE_URL is not a postgresql:// URL`)
  })

  it.each(['', 'not a url', 'nataskium_test', '127.0.0.1:5433/nataskium_test'])('не URL: %j', (url) => {
    expect(refusalOf(url)).toBe(`${REFUSAL_PREFIX}DATABASE_URL is not a URL`)
  })

  it.each([
    ['тот же адрес', VALID_URL, VALID_URL],
    ['та же база через localhost', urlWith({ host: 'localhost' }), VALID_URL],
    ['та же база с другим паролем', VALID_URL, 'postgresql://other:other@127.0.0.1:5433/nataskium_test'],
  ])('совпадает с dev-адресом: %s', (_name, url, devUrl) => {
    expect(refusalOf(url, devUrl)).toBe(`${REFUSAL_PREFIX}DATABASE_URL points to the development database`)
  })

  it('NODE_ENV=production — отказ даже для верного адреса', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(refusalOf(VALID_URL)).toBe(`${REFUSAL_PREFIX}NODE_ENV is production`)
  })

  // pg берёт host и port из query-параметров вместо адреса: проверка видит 127.0.0.1:5433, подключение уходит в другое место
  it.each([
    ['?port=5432 — dev-сервер', `${VALID_URL}?port=5432`],
    ['?host= — удалённый сервер', `${VALID_URL}?host=db.example.com`],
    ['?host= — unix-сокет', `${VALID_URL}?host=/var/run/postgresql`],
    ['?user= и ?password=', `${VALID_URL}?user=nataskium&password=x`],
    ['безобидный ?sslmode=', `${VALID_URL}?sslmode=disable`],
    ['?host=%2Ftmp — unix-сокет в кодировке', `${VALID_URL}?host=%2Ftmp`],
    ['?x=_test — суффикс в query, а не в имени', urlWith({ name: 'nataskium' }) + '?x=_test'],
  ])('query-параметр меняет адрес подключения: %s', (_name, url) => {
    expect(refusalOf(url)).toBe(`${REFUSAL_PREFIX}query parameters are not allowed`)
  })

  it.each([
    ['пустой ?', `${VALID_URL}?`],
    ['пустой #', `${VALID_URL}#`],
  ])('%s не считается параметрами: url.search и url.hash пусты', (_name, url) => {
    expect(() => assertTestDatabaseUrl(url)).not.toThrow()
  })

  it.each([`${VALID_URL}#x`, `${VALID_URL}#port=5432`])('фрагмент: %s', (url) => {
    expect(refusalOf(url)).toBe(`${REFUSAL_PREFIX}fragment is not allowed`)
  })

  it.each([
    ['query-параметр', `${VALID_URL}?port=5432`],
    ['фрагмент', `${VALID_URL}#x`],
  ])('в ошибке нет пароля: %s', (_name, url) => {
    expect(refusalOf(url)).not.toContain(TEST_PASSWORD)
  })

  it.each([
    ['порт', urlWith({ port: ':5432' })],
    ['имя', urlWith({ name: 'nataskium' })],
    ['хост', urlWith({ host: 'db.example.com' })],
    ['схема', urlWith({ protocol: 'mysql' })],
    ['dev-база', VALID_URL],
  ])('в ошибке нет пароля: %s', (_name, url) => {
    expect(refusalOf(url, VALID_URL)).not.toContain(TEST_PASSWORD)
  })
})

describe('TestDatabaseRefusedError', () => {
  it('отказ защиты — TestDatabaseRefusedError с причиной, без адреса', () => {
    let refusal: unknown
    try {
      assertTestDatabaseUrl(urlWith({ port: ':5432' }))
    } catch (error) {
      refusal = error
    }

    expect(refusal).toBeInstanceOf(TestDatabaseRefusedError)
    expect(refusal).toBeInstanceOf(Error)
    expect((refusal as Error).name).toBe('TestDatabaseRefusedError')
    expect((refusal as Error).message).not.toContain('127.0.0.1')
    expect((refusal as Error).message).not.toContain(TEST_PASSWORD)
  })
})

describe('clearPostgresEnv', () => {
  it('удаляет все переменные с префиксом PG и не трогает остальные', () => {
    vi.stubEnv('PGHOST', 'db.example.com')
    vi.stubEnv('PGPORT', '5432')
    vi.stubEnv('PGDATABASE', 'nataskium')
    vi.stubEnv('PGPASSWORD', TEST_PASSWORD)
    vi.stubEnv('QA_KEEP_ME', 'kept')

    clearPostgresEnv()

    expect(Object.keys(process.env).filter((name) => name.startsWith('PG'))).toEqual([])
    expect(process.env.QA_KEEP_ME).toBe('kept')
  })

  it('в unit-воркере уже нет PG-переменных: их убрал vitest.config.ts', () => {
    expect(Object.keys(process.env).filter((name) => name.startsWith('PG'))).toEqual([])
  })
})
