import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { isTransactionConflict, isUniqueViolation } from '../../../shared/infrastructure'
import type { ActivationResult, PendingRegistrationRepository } from '../types'
import { TEACHER_ACCOUNT_SELECT } from './teacherRepository'

const PENDING_REGISTRATION_SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  displayName: true,
  expiresAt: true,
} satisfies Prisma.PendingRegistrationSelect

// Операции над одним email внутри транзакции — по очереди: подтверждение регистрации, а позже вход через Google
// и удаление аккаунта. Без этого две записи одного email, подтверждённые одновременно, взаимно блокируют друг
// друга на удалении «всех записей email». Блокировка снимается в конце транзакции; email — параметр запроса
export async function lockEmail(tx: Prisma.TransactionClient, email: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))`
}

export function makePendingRegistrationRepository(prisma: PrismaClient): PendingRegistrationRepository {
  return {
    async create(registration) {
      await prisma.pendingRegistration.create({ data: registration })
    },

    findByTokenHash: (tokenHash) =>
      prisma.pendingRegistration.findUnique({ where: { tokenHash }, select: PENDING_REGISTRATION_SELECT }),

    async activate(registration, tokenHash): Promise<ActivationResult> {
      try {
        return await prisma.$transaction(async (tx): Promise<ActivationResult> => {
          await lockEmail(tx, registration.email)

          // CAS: из двух параллельных подтверждений одним токеном запись удалит только одно
          const { count } = await tx.pendingRegistration.deleteMany({
            where: { id: registration.id, tokenHash, expiresAt: { gt: new Date() } },
          })
          if (count !== 1) return { status: 'alreadyUsed' }

          // Остальные регистрации этого email больше не нужны: аккаунт создаётся с паролем этой записи
          await tx.pendingRegistration.deleteMany({ where: { email: registration.email } })

          const existing = await tx.teacher.findUnique({ where: { email: registration.email }, select: { id: true } })
          if (existing !== null) return { status: 'emailTaken' }

          const teacher = await tx.teacher.create({
            data: {
              email: registration.email,
              passwordHash: registration.passwordHash,
              displayName: registration.displayName,
              emailVerifiedAt: new Date(),
            },
            select: TEACHER_ACCOUNT_SELECT,
          })
          return { status: 'activated', teacher }
        })
      } catch (error) {
        // Учителя с этим email создали параллельно (например, вход через Google) между проверкой и вставкой
        if (isUniqueViolation(error)) return { status: 'emailTaken' }
        // Страховка, если очередь по email всё же не сработала: конфликт — это «уже подтверждено», а не 500
        if (isTransactionConflict(error)) return { status: 'alreadyUsed' }
        throw error
      }
    },

    async deleteExpired(now) {
      const { count } = await prisma.pendingRegistration.deleteMany({ where: { expiresAt: { lt: now } } })
      return count
    },
  }
}
