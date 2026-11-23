import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client'

// Запрос дольше — ошибка, а не занятое соединение: медленный публичный запрос не держит общий пул (10 соединений)
const STATEMENT_TIMEOUT_MS = 5000

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, statement_timeout: STATEMENT_TIMEOUT_MS }) })
}
