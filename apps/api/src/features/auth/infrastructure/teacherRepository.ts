import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { ServiceBusyError } from '../../../shared/errors'
import { isTransactionConflict, isUniqueViolation } from '../../../shared/infrastructure'
import type { GoogleSignInResult, TeacherRepository } from '../types'
import { lockEmail } from './emailLock'

// Явный select: в TeacherAccount попадают только нужные auth поля, а не вся строка
export const TEACHER_ACCOUNT_SELECT = {
  id: true,
  email: true,
  displayName: true,
  passwordHash: true,
  googleId: true,
  emailVerifiedAt: true,
} satisfies Prisma.TeacherSelect

// Взаимоблокировка удаления аккаунта с параллельной записью токена: одна повторная попытка, затем 503
const DELETE_ACCOUNT_ATTEMPTS = 2
const DELETE_ACCOUNT_RETRY_AFTER_SECONDS = 1

export function makeTeacherRepository(prisma: PrismaClient): TeacherRepository {
  return {
    findByEmail: (email) => prisma.teacher.findUnique({ where: { email }, select: TEACHER_ACCOUNT_SELECT }),
    findById: (id) => prisma.teacher.findUnique({ where: { id }, select: TEACHER_ACCOUNT_SELECT }),

    async deleteAccount(teacherId, email) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await prisma.$transaction(async (tx) => {
            // Та же очередь по email, что у подтверждения регистрации и входа через Google: удаление не разойдётся
            // с одновременным созданием учителя по ожидающей регистрации этого же email
            await lockEmail(tx, email)
            // У pending_registrations нет FK на учителя — каскад их не удалит
            await tx.pendingRegistration.deleteMany({ where: { email } })
            // Токены — до строки учителя, в том же порядке, что у rotate (токен, затем FK на учителя):
            // иначе каскад ждал бы токен, а rotate — учителя, и PostgreSQL прерывал бы одну из транзакций
            await tx.refreshToken.deleteMany({ where: { teacherId } })
            // Задания и шкалы учителя (когда появятся) — FK с onDelete: Cascade, удалятся этой же командой
            const { count } = await tx.teacher.deleteMany({ where: { id: teacherId } })
            return count === 1
          })
        } catch (error) {
          if (!isTransactionConflict(error)) throw error
          if (attempt >= DELETE_ACCOUNT_ATTEMPTS) throw new ServiceBusyError(DELETE_ACCOUNT_RETRY_AFTER_SECONDS)
        }
      }
    },

    async signInWithGoogle(profile, now) {
      try {
        return await prisma.$transaction(async (tx): Promise<GoogleSignInResult> => {
          const linked = await tx.teacher.findUnique({ where: { googleId: profile.googleId }, select: TEACHER_ACCOUNT_SELECT })
          if (linked !== null) return { status: 'signedIn', teacher: linked }

          // Под той же блокировкой, что подтверждение регистрации: иначе они взаимно блокируются на pending_registrations
          await lockEmail(tx, profile.email)
          // Пароли, заданные до подтверждения, отбрасываются: Google подтвердил, что почта принадлежит этому человеку
          await tx.pendingRegistration.deleteMany({ where: { email: profile.email } })

          const existing = await tx.teacher.findUnique({ where: { email: profile.email }, select: TEACHER_ACCOUNT_SELECT })
          if (existing !== null) {
            // Тот же Google-аккаунт: параллельный вход уже создал или привязал учителя
            if (existing.googleId === profile.googleId) return { status: 'signedIn', teacher: existing }
            // Email тот же, а Google-аккаунт другой: молча перепривязывать нельзя
            if (existing.googleId !== null) return { status: 'conflict' }
            // Без Google у учителя всегда есть пароль (CHECK teachers_login_method_check): привязка — только после
            // его ввода. Google подтвердил адрес, но не то, что аккаунт Google принадлежит этому учителю
            return { status: 'passwordRequired', teacherId: existing.id }
          }

          const teacher = await tx.teacher.create({
            data: { email: profile.email, googleId: profile.googleId, displayName: profile.displayName, emailVerifiedAt: now },
            select: TEACHER_ACCOUNT_SELECT,
          })
          return { status: 'signedIn', teacher }
        })
      } catch (error) {
        if (!isUniqueViolation(error) && !isTransactionConflict(error)) throw error
        // Параллельный вход тем же Google-аккаунтом успел создать учителя
        const teacher = await prisma.teacher.findUnique({ where: { googleId: profile.googleId }, select: TEACHER_ACCOUNT_SELECT })
        return teacher === null ? { status: 'conflict' } : { status: 'signedIn', teacher }
      }
    },
  }
}
