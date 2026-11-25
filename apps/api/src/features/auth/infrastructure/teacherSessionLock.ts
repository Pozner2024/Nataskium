import type { Prisma } from '../../../generated/prisma/client'

// Выдача, ротация и отзыв сессий одного учителя — по очереди. Без этого DELETE отзыва (сброс и смена пароля,
// «выйти везде») не видел бы токен, который параллельная транзакция ещё не закоммитила, и тот переживал бы отзыв.
// Берётся первой командой транзакции: ожидающий ещё ничего не держит, новых взаимоблокировок нет.
// Ключ отличается от lockEmail префиксом; снимается в конце транзакции
export async function lockTeacherSessions(tx: Prisma.TransactionClient, teacherId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`teacher-sessions:${teacherId}`}, 0))`
}
