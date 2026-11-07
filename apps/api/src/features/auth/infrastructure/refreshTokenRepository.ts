import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { ServiceBusyError } from '../../../shared/errors'
import { isForeignKeyViolation, isTransactionConflict } from '../../../shared/infrastructure'
import type { RefreshTokenRepository, RotateResult } from '../types'

const REFRESH_SESSION_SELECT = {
  id: true,
  teacherId: true,
  familyId: true,
  familyExpiresAt: true,
  expiresAt: true,
  revokedAt: true,
} satisfies Prisma.RefreshTokenSelect

// Взаимоблокировка создания семьи: одна повторная попытка, затем 503
const CREATE_FAMILY_ATTEMPTS = 2
const CREATE_FAMILY_RETRY_AFTER_SECONDS = 1

// deleteMany/updateMany вместо delete/update: отсутствующая строка — не ошибка P2025, а count = 0.
// Нарушение FK (P2003) при создании токена — учителя удалили между проверкой в use-case и записью
export function makeRefreshTokenRepository(prisma: PrismaClient): RefreshTokenRepository {
  return {
    async createFamily(token, maxFamilies) {
      for (let attempt = 1; ; attempt++) {
        try {
          await prisma.$transaction(async (tx) => {
            // Сначала вытеснение, потом вставка: блокировки «токены → строка учителя» (FK новой строки) в том же
            // порядке, что у deleteAccount и rotate, — иначе вставка держала бы учителя, ожидая токены удаления.
            // В каждой живой семье ровно один неотозванный токен — по ним и считаем семьи, новые первыми
            const outdated = await tx.refreshToken.findMany({
              where: { teacherId: token.teacherId, revokedAt: null },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip: maxFamilies - 1,
              select: { familyId: true },
            })
            if (outdated.length > 0) {
              await tx.refreshToken.deleteMany({ where: { familyId: { in: outdated.map((row) => row.familyId) } } })
            }

            await tx.refreshToken.create({ data: token })
          })
          return true
        } catch (error) {
          if (isForeignKeyViolation(error)) return false
          if (!isTransactionConflict(error)) throw error
          // Взаимоблокировка (обычно с удалением аккаунта): повтор увидит, что учителя нет (P2003 → false)
          if (attempt >= CREATE_FAMILY_ATTEMPTS) throw new ServiceBusyError(CREATE_FAMILY_RETRY_AFTER_SECONDS)
        }
      }
    },

    findByHash: (tokenHash) => prisma.refreshToken.findUnique({ where: { tokenHash }, select: REFRESH_SESSION_SELECT }),

    async rotate(oldTokenId, next, now) {
      try {
        return await prisma.$transaction(async (tx): Promise<RotateResult> => {
          const { count } = await tx.refreshToken.updateMany({
            where: { id: oldTokenId, revokedAt: null },
            data: { revokedAt: now },
          })
          if (count === 0) return 'alreadyUsed'

          await tx.refreshToken.create({ data: next })
          return 'rotated'
        })
      } catch (error) {
        if (isForeignKeyViolation(error)) return 'teacherGone'
        // Взаимоблокировка с удалением аккаунта: транзакция откатилась, новый токен не выдан
        // (если удаление прервалось, старый остаётся действительным)
        if (isTransactionConflict(error)) return 'conflict'
        throw error
      }
    },

    async deleteFamily(familyId) {
      await prisma.refreshToken.deleteMany({ where: { familyId } })
    },

    async deleteAllForTeacher(teacherId) {
      await prisma.refreshToken.deleteMany({ where: { teacherId } })
    },

    async deleteExpired(now) {
      const { count } = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } })
      return count
    },
  }
}
