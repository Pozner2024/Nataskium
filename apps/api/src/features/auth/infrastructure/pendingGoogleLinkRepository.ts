import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { isTransactionConflict, isUniqueViolation } from '../../../shared/infrastructure'
import type { GoogleLinkResult, PendingGoogleLinkRepository } from '../types'
import { lockEmail } from './emailLock'
import { TEACHER_ACCOUNT_SELECT } from './teacherRepository'

const PENDING_GOOGLE_LINK_SELECT = {
  id: true,
  teacherId: true,
  googleId: true,
  linkSecretHash: true,
  expiresAt: true,
  teacher: { select: { email: true, passwordHash: true } },
} satisfies Prisma.PendingGoogleLinkSelect

// deleteMany/updateMany вместо delete/update: отсутствующая строка — не ошибка P2025, а count = 0
export function makePendingGoogleLinkRepository(prisma: PrismaClient): PendingGoogleLinkRepository {
  return {
    // Одна запись на учителя (unique по teacher_id): новая привязка заменяет прежнюю
    async replaceForTeacher(link) {
      await prisma.pendingGoogleLink.upsert({
        where: { teacherId: link.teacherId },
        create: link,
        update: {
          googleId: link.googleId,
          tokenHash: link.tokenHash,
          linkSecretHash: link.linkSecretHash,
          expiresAt: link.expiresAt,
        },
      })
    },

    async findByTokenHash(tokenHash) {
      const row = await prisma.pendingGoogleLink.findUnique({ where: { tokenHash }, select: PENDING_GOOGLE_LINK_SELECT })
      if (row === null) return null
      const { teacher, ...link } = row
      return { ...link, teacherEmail: teacher.email, teacherPasswordHash: teacher.passwordHash }
    },

    async completeLink(link, tokenHash, now) {
      try {
        return await prisma.$transaction(async (tx): Promise<GoogleLinkResult> => {
          // Та же очередь по email, что у подтверждения регистрации и входа через Google
          await lockEmail(tx, link.teacherEmail)

          // CAS: ссылка одноразовая — из двух параллельных подтверждений запись удалит только одно
          const { count } = await tx.pendingGoogleLink.deleteMany({
            where: { id: link.id, tokenHash, expiresAt: { gt: now } },
          })
          if (count !== 1) return { status: 'invalid' }

          // Только если Google у учителя ещё не привязан: иначе между проверкой и подтверждением привязали другой
          const updated = await tx.teacher.updateMany({
            where: { id: link.teacherId, googleId: null },
            data: { googleId: link.googleId },
          })
          const teacher = await tx.teacher.findUnique({ where: { id: link.teacherId }, select: TEACHER_ACCOUNT_SELECT })
          if (teacher === null) return { status: 'invalid' }
          if (updated.count !== 1 && teacher.googleId !== link.googleId) return { status: 'conflict' }
          return { status: 'linked', teacher }
        })
      } catch (error) {
        // Этот Google-аккаунт уже привязан к другому учителю (unique по google_id)
        if (isUniqueViolation(error) || isTransactionConflict(error)) return { status: 'conflict' }
        throw error
      }
    },

    async deleteExpired(now) {
      const { count } = await prisma.pendingGoogleLink.deleteMany({ where: { expiresAt: { lt: now } } })
      return count
    },
  }
}
