import type { Prisma } from '../../../generated/prisma/client'
import type { QuizImageRepository } from '../types'

// Принимает и клиент транзакции: привязка картинок сохраняется вместе с викториной
export function makeQuizImageRepository(prisma: Prisma.TransactionClient): QuizImageRepository {
  return {
    async create(id, teacherId) {
      return prisma.quizImage.create({ data: { id, teacherId }, select: { id: true } })
    },

    async findOwned(ids, teacherId) {
      if (ids.length === 0) return []
      return prisma.quizImage.findMany({ where: { id: { in: [...ids] }, teacherId }, select: { id: true, quizId: true } })
    },

    async attach(quizId, teacherId, ids) {
      if (ids.length === 0) return 0
      const { count } = await prisma.quizImage.updateMany({
        where: { id: { in: [...ids] }, teacherId, OR: [{ quizId: null }, { quizId }] },
        data: { quizId },
      })
      return count
    },

    async detachMissing(quizId, teacherId, keepIds) {
      const rows = await prisma.quizImage.updateManyAndReturn({
        where: { quizId, teacherId, id: { notIn: [...keepIds] } },
        data: { quizId: null },
        select: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async deleteRows(ids) {
      if (ids.length === 0) return
      await prisma.quizImage.deleteMany({ where: { id: { in: [...ids] } } })
    },

    // Одной командой: проверка quiz_id IS NULL и удаление атомарны относительно параллельной привязки.
    // В Prisma нет deleteManyAndReturn; запрос параметризован тегированным шаблоном
    async deleteDetached(ids) {
      if (ids.length === 0) return []
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        DELETE FROM quiz_images WHERE id = ANY(${[...ids]}::uuid[]) AND quiz_id IS NULL RETURNING id::text AS id
      `
      return rows.map((row) => row.id)
    },

    async listOrphans(olderThan) {
      const rows = await prisma.quizImage.findMany({
        where: { quizId: null, createdAt: { lt: olderThan } },
        select: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async existingIds(ids) {
      if (ids.length === 0) return []
      const rows = await prisma.quizImage.findMany({ where: { id: { in: [...ids] } }, select: { id: true } })
      return rows.map((row) => row.id)
    },

    async countAll() {
      return prisma.quizImage.count()
    },
  }
}
