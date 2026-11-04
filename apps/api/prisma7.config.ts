import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'prisma/config'

// Корневой .env есть только локально: в Docker и CI переменные приходят из окружения
const ROOT_ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url))
if (existsSync(ROOT_ENV_FILE)) process.loadEnvFile(ROOT_ENV_FILE)

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Не env(): он бросает ошибку без DATABASE_URL, а prisma generate в postinstall адрес не нужен
    url: process.env.DATABASE_URL ?? '',
  },
})
