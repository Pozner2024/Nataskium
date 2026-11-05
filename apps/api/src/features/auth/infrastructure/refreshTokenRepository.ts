import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { RefreshTokenRepository } from '../types'

const REFRESH_SESSION_SELECT = {
  id: true,
  teacherId: true,
  familyId: true,
  familyExpiresAt: true,
  expiresAt: true,
  revokedAt: true,
} satisfies Prisma.RefreshTokenSelect

// deleteMany/updateMany вместо delete/update: отсутствующая строка — не ошибка P2025, а count = 0
export function makeRefreshTokenRepository(prisma: PrismaClient): RefreshTokenRepository {
  return {
    async createFamily(token, maxFamilies) {
      await prisma.$transaction(async (tx) => {
        await tx.refreshToken.create({ data: token })

        // В каждой живой семье ровно один неотозванный токен — по ним и считаем семьи, новые первыми.
        // Новая семья в выборку не входит: при равном createdAt она иначе могла бы оказаться «старой»
        const outdated = await tx.refreshToken.findMany({
          where: { teacherId: token.teacherId, revokedAt: null, familyId: { not: token.familyId } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: maxFamilies - 1,
          select: { familyId: true },
        })
        if (outdated.length === 0) return

        await tx.refreshToken.deleteMany({ where: { familyId: { in: outdated.map((row) => row.familyId) } } })
      })
    },

    findByHash: (tokenHash) => prisma.refreshToken.findUnique({ where: { tokenHash }, select: REFRESH_SESSION_SELECT }),

    rotate(oldTokenId, next, now) {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.refreshToken.updateMany({
          where: { id: oldTokenId, revokedAt: null },
          data: { revokedAt: now },
        })
        if (count === 0) return false

        await tx.refreshToken.create({ data: next })
        return true
      })
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
