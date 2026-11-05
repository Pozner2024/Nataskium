import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { createPrismaClient } from '../../src/shared/infrastructure'
import { createTestPrisma, readTestDatabaseUrl, truncateAll } from './testDatabase'

// Временная база без суффикса _test внутри тестового сервера: на ней проверяется отказ очистки
const FOREIGN_DATABASE = 'qa_guard_probe'
const ARGON2ID_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'
const TEACHER_ID = '00000000-0000-0000-0000-0000000000a1'
const APP_TABLES = ['teachers', 'refresh_tokens', 'pending_registrations']

let prisma: PrismaClient
let foreign: PrismaClient
let foreignUrl: string

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  return `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? null)}`
}

async function rejectionOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    return errorText(error)
  }
  throw new Error('expected a rejection')
}

async function countRows(client: PrismaClient, table: string): Promise<number> {
  // Имя таблицы — из константы теста, не из ввода
  const [row] = await client.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*) AS count FROM "${table}"`)
  return Number(row?.count)
}

async function seedApplicationTables(): Promise<void> {
  await prisma.$executeRaw`INSERT INTO teachers (id, email, password_hash, updated_at)
    VALUES (${TEACHER_ID}::uuid, 'qa-teacher@example.test', ${ARGON2ID_HASH}, now())`
  await prisma.$executeRaw`INSERT INTO refresh_tokens (id, teacher_id, family_id, family_expires_at, token_hash, expires_at)
    VALUES (gen_random_uuid(), ${TEACHER_ID}::uuid, gen_random_uuid(), now() + interval '30 days', ${'a'.repeat(64)}, now() + interval '14 days')`
  await prisma.$executeRaw`INSERT INTO pending_registrations (id, email, password_hash, token_hash, expires_at)
    VALUES (gen_random_uuid(), 'qa-pending@example.test', ${ARGON2ID_HASH}, ${'b'.repeat(64)}, now() + interval '1 day')`
}

beforeAll(async () => {
  prisma = await createTestPrisma()
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${FOREIGN_DATABASE} WITH (FORCE)`)
  await prisma.$executeRawUnsafe(`CREATE DATABASE ${FOREIGN_DATABASE}`)

  const url = new URL(readTestDatabaseUrl())
  url.pathname = `/${FOREIGN_DATABASE}`
  foreignUrl = url.toString()
  // Обычный клиент без защиты: так очистку мог бы вызвать код с ошибкой в конфиге
  foreign = createPrismaClient(foreignUrl)
  await foreign.$executeRawUnsafe('CREATE TABLE qa_data (id int)')
  await foreign.$executeRawUnsafe('INSERT INTO qa_data VALUES (1), (2)')
})

afterAll(async () => {
  await foreign?.$disconnect()
  await prisma?.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${FOREIGN_DATABASE} WITH (FORCE)`)
  await prisma?.$disconnect()
})

describe('truncateAll на базе без _test', () => {
  it('бросает P0001 и не трогает данные', async () => {
    const text = await rejectionOf(truncateAll(foreign))

    expect(text).toContain('"code":"P0001"')
    expect(text).toContain(`refusing to truncate ${FOREIGN_DATABASE}`)
    expect(await countRows(foreign, 'qa_data')).toBe(2)
  })
})

describe('createTestPrisma на базе без _test', () => {
  it('отказывает до подключения', async () => {
    const text = await rejectionOf(createTestPrisma(foreignUrl))

    expect(text).toContain('Refusing to use the database for integration tests: database name does not end with _test')
  })
})

describe('truncateAll на тестовой базе', () => {
  it('очищает все таблицы приложения', async () => {
    await truncateAll(prisma)
    await seedApplicationTables()
    for (const table of APP_TABLES) expect(await countRows(prisma, table)).toBe(1)

    await truncateAll(prisma)

    for (const table of APP_TABLES) expect(await countRows(prisma, table)).toBe(0)
  })

  it('не трогает _prisma_migrations', async () => {
    const before = await prisma.$queryRaw<{ name: string }[]>`SELECT migration_name AS name FROM _prisma_migrations ORDER BY 1`

    await truncateAll(prisma)

    const after = await prisma.$queryRaw<{ name: string }[]>`SELECT migration_name AS name FROM _prisma_migrations ORDER BY 1`
    expect(before.length).toBeGreaterThan(0)
    expect(after).toEqual(before)
  })

  it('на пустых таблицах не падает', async () => {
    await truncateAll(prisma)

    await expect(truncateAll(prisma)).resolves.toBeUndefined()
  })
})
