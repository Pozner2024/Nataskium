import { randomBytes, randomUUID } from 'node:crypto'
import type { PrismaClient } from '../../src/generated/prisma/client'

// Не настоящий хэш пароля: CHECK требует только префикс $argon2id$, а argon2 в этих тестах не нужен
export const ARGON2ID_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'
const TOKEN_HASH_BYTES = 32
const MS_PER_HOUR = 60 * 60 * 1000
const HOURS_PER_DAY = 24

export function hours(count: number): number {
  return count * MS_PER_HOUR
}

export function days(count: number): number {
  return hours(count * HOURS_PER_DAY)
}

export function fromNow(ms: number): Date {
  return new Date(Date.now() + ms)
}

// Формат HMAC-SHA256 в hex, как в CHECK token_hash
export function newTokenHash(): string {
  return randomBytes(TOKEN_HASH_BYTES).toString('hex')
}

export async function createTeacher(prisma: PrismaClient, email = `qa-${randomUUID()}@example.test`) {
  return prisma.teacher.create({ data: { email, passwordHash: ARGON2ID_HASH } })
}
