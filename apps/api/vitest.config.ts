import { configDefaults, defineConfig } from 'vitest/config'
import { clearPostgresEnv } from './tests/integration/testDatabaseUrl.ts'

// Код приложения, случайно прочитавший DATABASE_URL в unit-тесте, упадёт на проверке env, а не уйдёт в dev-БД
process.env.DATABASE_URL = ''
clearPostgresEnv()

export default defineConfig({
  test: {
    // Интеграционные тесты — только через vitest.integration.config.ts: им нужна тестовая БД в Docker
    exclude: [...configDefaults.exclude, 'tests/integration/**'],
  },
})
