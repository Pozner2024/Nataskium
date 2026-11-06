import type { Prisma } from '../../../generated/prisma/client'

// Операции над одним email внутри транзакции — по очереди: подтверждение регистрации, а позже вход через Google
// и удаление аккаунта. Без этого две записи одного email, подтверждённые одновременно, взаимно блокируют друг
// друга на удалении «всех записей email». Блокировка снимается в конце транзакции; email — параметр запроса
export async function lockEmail(tx: Prisma.TransactionClient, email: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))`
}
