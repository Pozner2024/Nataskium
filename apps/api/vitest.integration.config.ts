import { defineConfig } from 'vitest/config'
import { clearPostgresEnv, readTestDatabaseUrl } from './tests/integration/testDatabaseUrl.ts'

const INTEGRATION_TIMEOUT_MS = 30_000

// Адрес уже проверен: код приложения, прочитавший DATABASE_URL, попадёт только в тестовую БД
process.env.DATABASE_URL = readTestDatabaseUrl()
clearPostgresEnv()

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.int.test.ts'],
    globalSetup: ['tests/integration/globalSetup.ts'],
    // База одна на все файлы, а truncateAll очищает её целиком: файлы идут по очереди
    fileParallelism: false,
    testTimeout: INTEGRATION_TIMEOUT_MS,
    hookTimeout: INTEGRATION_TIMEOUT_MS,
  },
})
