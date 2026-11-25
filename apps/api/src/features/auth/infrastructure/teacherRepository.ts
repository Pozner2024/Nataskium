import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import { ServiceBusyError } from '../../../shared/errors'
import { isTransactionConflict, isUniqueViolation } from '../../../shared/infrastructure'
import type { GoogleSignInResult, TeacherRepository } from '../types'
import { lockEmail } from './emailLock'
import { lockTeacherSessions } from './teacherSessionLock'

// Явный select: в TeacherAccount попадают только нужные auth поля, а не вся строка
export const TEACHER_ACCOUNT_SELECT = {
  id: true,
  email: true,
  displayName: true,
  passwordHash: true,
  googleId: true,
  emailVerifiedAt: true,
} satisfies Prisma.TeacherSelect

// Пароль сменили между сверкой и записью: откат транзакции, токены остаются
class StalePasswordHash extends Error {}

// Взаимоблокировка удаления аккаунта с параллельной записью токена: одна повторная попытка, затем 503
const DELETE_ACCOUNT_ATTEMPTS = 2
const DELETE_ACCOUNT_RETRY_AFTER_SECONDS = 1

// Транзакция удаления аккаунта с повтором при взаимоблокировке: удаление по паролю и через Google
export async function withDeleteAccountRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (!isTransactionConflict(error)) throw error
      if (attempt >= DELETE_ACCOUNT_ATTEMPTS) throw new ServiceBusyError(DELETE_ACCOUNT_RETRY_AFTER_SECONDS)
    }
  }
}

// Внутри транзакции после lockEmail(email). Каскад удаляет refresh-токены, ссылки сброса, привязки и подтверждения
// Google. false — учителя уже нет или (при verifiedPasswordHash) пароль сменили после сверки: вызывающий откатывает транзакцию
export async function deleteTeacherRows(
  tx: Prisma.TransactionClient,
  teacherId: string,
  email: string,
  verifiedPasswordHash?: string,
): Promise<boolean> {
  // У pending_registrations нет FK на учителя — каскад их не удалит
  await tx.pendingRegistration.deleteMany({ where: { email } })
  // Токены — до строки учителя, в том же порядке, что у rotate (токен, затем FK на учителя):
  // иначе каскад ждал бы токен, а rotate — учителя, и PostgreSQL прерывал бы одну из транзакций
  await tx.refreshToken.deleteMany({ where: { teacherId } })
  // Задания и шкалы учителя (когда появятся) — FK с onDelete: Cascade, удалятся этой же командой
  const { count } = await tx.teacher.deleteMany({ where: { id: teacherId, passwordHash: verifiedPasswordHash } })
  return count === 1
}

export function makeTeacherRepository(prisma: PrismaClient): TeacherRepository {
  return {
    findByEmail: (email) => prisma.teacher.findUnique({ where: { email }, select: TEACHER_ACCOUNT_SELECT }),
    findById: (id) => prisma.teacher.findUnique({ where: { id }, select: TEACHER_ACCOUNT_SELECT }),

    async deleteAccount(teacherId, email, verifiedPasswordHash) {
      try {
        return await withDeleteAccountRetry(() =>
          prisma.$transaction(async (tx) => {
            // Та же очередь по email, что у подтверждения регистрации и входа через Google: удаление не разойдётся
            // с одновременным созданием учителя по ожидающей регистрации этого же email
            await lockEmail(tx, email)
            const deleted = await deleteTeacherRows(tx, teacherId, email, verifiedPasswordHash)
            // Откат: ожидающие регистрации и токены, удалённые выше, остаются
            if (!deleted) throw new StalePasswordHash()
            return true
          }),
        )
      } catch (error) {
        if (error instanceof StalePasswordHash) return false
        throw error
      }
    },

    async changePassword(teacherId, verifiedPasswordHash, passwordHash) {
      try {
        return await prisma.$transaction(async (tx) => {
          await lockTeacherSessions(tx, teacherId)
          // Токены — до строки учителя, в том же порядке, что у rotate и deleteAccount: иначе взаимоблокировка
          await tx.refreshToken.deleteMany({ where: { teacherId } })
          const { count } = await tx.teacher.updateMany({
            where: { id: teacherId, passwordHash: verifiedPasswordHash },
            data: { passwordHash },
          })
          if (count !== 1) throw new StalePasswordHash()
          await tx.passwordReset.deleteMany({ where: { teacherId } })
          await tx.pendingGoogleLink.deleteMany({ where: { teacherId } })
          // Удаление через Google — только для аккаунта без пароля: подтверждение, начатое до смены, гасится
          await tx.pendingGoogleReauth.deleteMany({ where: { teacherId } })
          return true
        })
      } catch (error) {
        if (error instanceof StalePasswordHash) return false
        throw error
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
