import type { PrismaClient } from '../../src/generated/prisma/client'
import { createPrismaClient } from '../../src/shared/infrastructure'
import { TEST_DATABASE_SUFFIX, assertTestDatabaseUrl, readTestDatabaseUrl, refuse } from './testDatabaseUrl'

export {
  TEST_DATABASE_PORT,
  TEST_DATABASE_SUFFIX,
  TestDatabaseRefusedError,
  assertTestDatabaseUrl,
  readTestDatabaseUrl,
} from './testDatabaseUrl'

// Второй рубеж после подключения: имя базы спрашиваем у самого сервера
async function assertConnectedToTestDatabase(prisma: PrismaClient): Promise<void> {
  const [row] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`
  if (row?.name.endsWith(TEST_DATABASE_SUFFIX)) return

  await prisma.$disconnect()
  refuse(`connected database does not end with ${TEST_DATABASE_SUFFIX}`)
}

export async function createTestPrisma(url: string = readTestDatabaseUrl()): Promise<PrismaClient> {
  assertTestDatabaseUrl(url)
  const prisma = createPrismaClient(url)
  await assertConnectedToTestDatabase(prisma)
  return prisma
}

// Проверка имени базы — внутри той же SQL-команды: очистка откажется работать на чужой базе
// при любом клиенте и конфиге. Имена таблиц — из каталога через format('%I.%I'), без подстановок из JS
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`
    DO $$
    DECLARE
      tables text;
    BEGIN
      -- В JS-шаблоне \\_ даёт \_ в SQL: подчёркивание буквальное, а не «любой символ»
      IF current_database() NOT LIKE '%\\_test' THEN
        RAISE EXCEPTION 'refusing to truncate %', current_database();
      END IF;

      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO tables
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';

      IF tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE ' || tables || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$
  `
}
