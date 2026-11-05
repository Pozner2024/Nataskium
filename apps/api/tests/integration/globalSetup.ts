import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { TestDatabaseRefusedError, createTestPrisma, readTestDatabaseUrl } from './testDatabase'

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PRISMA_CONFIG = 'prisma7.config.ts'
const START_HINT = 'start it with "docker compose -f docker-compose.test.yml up -d"'

// bin — строка или объект { prisma: путь }
const prismaPackageSchema = z.object({
  bin: z.union([z.string(), z.object({ prisma: z.string() }).transform((bin) => bin.prisma)]),
})

// Путь к CLI — из поля bin пакета: внутренняя структура build/ может поменяться при обновлении Prisma
function resolvePrismaCli(): string {
  const require = createRequire(import.meta.url)
  const packageJsonPath = require.resolve('prisma/package.json')
  const { bin } = prismaPackageSchema.parse(require(packageJsonPath))
  return join(dirname(packageJsonPath), bin)
}

// migrate deploy, а не migrate dev: не создаёт миграций и не предлагает reset
function migrateDeploy(databaseUrl: string): void {
  const result = spawnSync(process.execPath, [resolvePrismaCli(), 'migrate', 'deploy', '--config', PRISMA_CONFIG], {
    cwd: API_ROOT,
    // Минимальное окружение: все переменные БД — только явно. Чего здесь нет, prisma7.config.ts
    // подставил бы из корневого .env, то есть из dev
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  })
  if (result.status === 0) return

  throw new Error(`prisma migrate deploy failed:\n${result.stdout}\n${result.stderr}`)
}

// До миграций: проверка адреса и current_database() на самом сервере
async function assertTestDatabaseReady(databaseUrl: string): Promise<void> {
  try {
    const prisma = await createTestPrisma(databaseUrl)
    await prisma.$disconnect()
  } catch (error) {
    if (error instanceof TestDatabaseRefusedError) throw error
    // Без исходной ошибки: в ней адрес сервера, а от разработчика нужно одно действие
    throw new Error(`Test database is not reachable: ${START_HINT}`)
  }
}

// vitest 5.0.5 падает при печати стека ошибки из globalSetup («code.charCodeAt is not a function») и прячет
// сообщение. Стек, заданный до первого обращения, V8 не пересобирает — сообщение доходит до разработчика
function withPlainStack(error: Error): Error {
  error.stack = `${error.name}: ${error.message}`
  return error
}

export default async function setup(): Promise<void> {
  try {
    const databaseUrl = readTestDatabaseUrl()
    await assertTestDatabaseReady(databaseUrl)
    migrateDeploy(databaseUrl)
  } catch (error) {
    throw error instanceof Error ? withPlainStack(error) : error
  }
}
