import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { isForeignKeyViolation } from '../../../shared/infrastructure'
import type { PendingGoogleReauthRepository } from '../types'
import { lockEmail } from './emailLock'
import { deleteTeacherRows, withDeleteAccountRetry } from './teacherRepository'

const PENDING_GOOGLE_REAUTH_SELECT = {
  id: true,
  teacherId: true,
  expiresAt: true,
  teacher: { select: { googleId: true, email: true, displayName: true } },
} satisfies Prisma.PendingGoogleReauthSelect

// deleteMany вместо delete: отсутствующая строка — не ошибка P2025, а count = 0
export function makePendingGoogleReauthRepository(prisma: PrismaClient): PendingGoogleReauthRepository {
  return {
    // Одна запись на учителя (unique по teacher_id): новый запуск заменяет прежний, старый state перестаёт работать
    async replaceForTeacher(reauth) {
      try {
        await prisma.pendingGoogleReauth.upsert({
          where: { teacherId: reauth.teacherId },
          create: reauth,
          update: { stateHash: reauth.stateHash, expiresAt: reauth.expiresAt },
        })
        return true
      } catch (error) {
        // Учителя удалили между проверкой в use-case и записью
        if (isForeignKeyViolation(error)) return false
        throw error
      }
    },

    async findByStateHash(stateHash) {
      const row = await prisma.pendingGoogleReauth.findUnique({ where: { stateHash }, select: PENDING_GOOGLE_REAUTH_SELECT })
      if (row === null) return null
      const { teacher, ...reauth } = row
      return { ...reauth, teacherGoogleId: teacher.googleId, teacherEmail: teacher.email, teacherDisplayName: teacher.displayName }
    },

    async deleteByStateHash(stateHash) {
      await prisma.pendingGoogleReauth.deleteMany({ where: { stateHash } })
    },

    deleteAccount(reauth, stateHash, now) {
      return withDeleteAccountRetry(() =>
        prisma.$transaction(async (tx) => {
          // Та же очередь по email, что у удаления по паролю, подтверждения регистрации и входа через Google
          await lockEmail(tx, reauth.teacherEmail)
          // CAS: подтверждение одноразовое — из двух параллельных callback аккаунт удалит только один
          const { count } = await tx.pendingGoogleReauth.deleteMany({
            where: { id: reauth.id, stateHash, expiresAt: { gt: now } },
          })
          if (count !== 1) return 'invalid'

          // Пароль мог появиться после запуска (сброс по письму): такой аккаунт удаляется только по паролю.
          // Запись уже снята — подтверждение погашено, аккаунт цел
          const teacher = await tx.teacher.findUnique({ where: { id: reauth.teacherId }, select: { passwordHash: true } })
          if (teacher === null) return 'invalid'
          if (teacher.passwordHash !== null) return 'hasPassword'
          return (await deleteTeacherRows(tx, reauth.teacherId, reauth.teacherEmail)) ? 'deleted' : 'invalid'
        }),
      )
    },

    async deleteExpired(now) {
      const { count } = await prisma.pendingGoogleReauth.deleteMany({ where: { expiresAt: { lt: now } } })
      return count
    },
  }
}
