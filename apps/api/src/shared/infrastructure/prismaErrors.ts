import { Prisma } from '../../generated/prisma/client'

const UNIQUE_VIOLATION_CODE = 'P2002'
// Взаимоблокировка или конфликт записи: PostgreSQL откатил одну из транзакций
const TRANSACTION_CONFLICT_CODE = 'P2034'

// Ошибки Prisma не выходят за пределы infrastructure/: репозиторий переводит их в результат для use-case
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION_CODE
}

export function isTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === TRANSACTION_CONFLICT_CODE
}
