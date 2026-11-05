// Без Prisma: модуль загружает и vitest.integration.config.ts
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

export const TEST_DATABASE_PORT = '5433'
export const TEST_DATABASE_SUFFIX = '_test'
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]']
const DATABASE_URL_PROTOCOLS = ['postgres:', 'postgresql:']
const POSTGRES_ENV_PREFIX = 'PG'

const TEST_ENV_FILE = fileURLToPath(new URL('../../../../.env.test', import.meta.url))
const DEV_ENV_FILE = fileURLToPath(new URL('../../../../.env', import.meta.url))

// Файл читается в отдельный объект: process.env и корневой .env на адрес тестовой БД не влияют
function readEnvFile(path: string): Record<string, string | undefined> {
  return parseEnv(readFileSync(path, 'utf8'))
}

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1))
}

// Отказ защиты — отдельный класс: globalSetup не должен подменять его подсказкой «запустите БД»
export class TestDatabaseRefusedError extends Error {
  constructor(reason: string) {
    // Без самого адреса: в нём пароль
    super(`Refusing to use the database for integration tests: ${reason}`)
    this.name = 'TestDatabaseRefusedError'
  }
}

export function refuse(reason: string): never {
  throw new TestDatabaseRefusedError(reason)
}

// Проверка до любого подключения: только локальная база на тестовом порту с суффиксом _test, не dev-база
export function assertTestDatabaseUrl(rawUrl: string, devRawUrl?: string): void {
  if (process.env.NODE_ENV === 'production') refuse('NODE_ENV is production')
  if (!URL.canParse(rawUrl)) refuse('DATABASE_URL is not a URL')

  const url = new URL(rawUrl)
  if (!DATABASE_URL_PROTOCOLS.includes(url.protocol)) refuse('DATABASE_URL is not a postgresql:// URL')
  // pg берёт ?host= и ?port= из query вместо хоста и порта адреса: ?port=5432 увёл бы подключение на dev-сервер
  if (url.search !== '') refuse('query parameters are not allowed')
  if (url.hash !== '') refuse('fragment is not allowed')
  if (!LOCAL_HOSTS.includes(url.hostname)) refuse('host is not local')
  if (url.port !== TEST_DATABASE_PORT) refuse(`port is not ${TEST_DATABASE_PORT}`)
  if (!databaseName(url).endsWith(TEST_DATABASE_SUFFIX)) refuse(`database name does not end with ${TEST_DATABASE_SUFFIX}`)

  if (devRawUrl === undefined || !URL.canParse(devRawUrl)) return
  const devUrl = new URL(devRawUrl)
  const isDevDatabase = devUrl.port === url.port && databaseName(devUrl) === databaseName(url)
  if (rawUrl === devRawUrl || isDevDatabase) refuse('DATABASE_URL points to the development database')
}

// Адрес тестовой БД из .env.test (DATABASE_URL из оболочки не используется) — уже проверенный
export function readTestDatabaseUrl(): string {
  if (!existsSync(TEST_ENV_FILE)) refuse('.env.test not found: cp .env.test.example .env.test')

  const url = readEnvFile(TEST_ENV_FILE).DATABASE_URL
  if (url === undefined || url === '') refuse('DATABASE_URL is not set in .env.test')

  const devUrl = existsSync(DEV_ENV_FILE) ? readEnvFile(DEV_ENV_FILE).DATABASE_URL : undefined
  assertTestDatabaseUrl(url, devUrl)
  return url
}

// pg подставляет PGHOST, PGPORT, PGDATABASE и др., если чего-то нет в адресе. Проверка выше требует хост, порт
// и базу в самом адресе, а очистка убирает и остальное влияние окружения оболочки на тестовые подключения
export function clearPostgresEnv(): void {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith(POSTGRES_ENV_PREFIX)) delete process.env[name]
  }
}
