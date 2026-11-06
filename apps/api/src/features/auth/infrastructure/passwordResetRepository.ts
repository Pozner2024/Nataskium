import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { PasswordResetRepository, PasswordResetResult } from '../types'

const PASSWORD_RESET_SELECT = {
  id: true,
  teacherId: true,
  expiresAt: true,
} satisfies Prisma.PasswordResetSelect

// deleteMany/updateMany вместо delete/update: отсутствующая строка — не ошибка P2025, а count = 0
export function makePasswordResetRepository(prisma: PrismaClient): PasswordResetRepository {
  return {
    // Одна запись на учителя (unique по teacher_id): upsert заменяет прежнюю ссылку новой. Из двух одновременных
    // запросов остаётся последний — действует одна ссылка, а не две
    async replaceForTeacher(reset) {
      await prisma.passwordReset.upsert({
        where: { teacherId: reset.teacherId },
        create: reset,
        update: { tokenHash: reset.tokenHash, expiresAt: reset.expiresAt },
      })
    },

    findByTokenHash: (tokenHash) =>
      prisma.passwordReset.findUnique({ where: { tokenHash }, select: PASSWORD_RESET_SELECT }),

    completeReset(reset, tokenHash, passwordHash, now) {
      return prisma.$transaction(async (tx): Promise<PasswordResetResult> => {
        // CAS: ссылка одноразовая — из двух параллельных сбросов запись удалит только один
        const { count } = await tx.passwordReset.deleteMany({
          where: { id: reset.id, tokenHash, expiresAt: { gt: now } },
        })
        if (count !== 1) return { status: 'invalid' }

        const updated = await tx.teacher.updateMany({ where: { id: reset.teacherId }, data: { passwordHash } })
        if (updated.count !== 1) return { status: 'invalid' }

        await tx.passwordReset.deleteMany({ where: { teacherId: reset.teacherId } })
        // Все сессии: кто бы ни знал старый пароль, после сброса он выходит отовсюду
        await tx.refreshToken.deleteMany({ where: { teacherId: reset.teacherId } })
        // Привязку Google, начатую до сброса, тоже нельзя завершить: она ждала старый пароль
        await tx.pendingGoogleLink.deleteMany({ where: { teacherId: reset.teacherId } })
        const teacher = await tx.teacher.findUniqueOrThrow({
          where: { id: reset.teacherId },
          select: { email: true, displayName: true },
        })
        return { status: 'reset', teacher }
      })
    },

    async deleteExpired(now) {
      const { count } = await prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: now } } })
      return count
    },
  }
}
