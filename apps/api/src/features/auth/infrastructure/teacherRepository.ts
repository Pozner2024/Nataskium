import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { TeacherRepository } from '../types'

// Явный select: в TeacherAccount попадают только нужные auth поля, а не вся строка
export const TEACHER_ACCOUNT_SELECT = {
  id: true,
  email: true,
  displayName: true,
  passwordHash: true,
  googleId: true,
  emailVerifiedAt: true,
} satisfies Prisma.TeacherSelect

export function makeTeacherRepository(prisma: PrismaClient): TeacherRepository {
  return {
    findByEmail: (email) => prisma.teacher.findUnique({ where: { email }, select: TEACHER_ACCOUNT_SELECT }),
    findById: (id) => prisma.teacher.findUnique({ where: { id }, select: TEACHER_ACCOUNT_SELECT }),
  }
}
