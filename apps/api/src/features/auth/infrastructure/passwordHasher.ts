import { randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import { ServiceBusyError } from '../../../shared/errors'
import type { PasswordHasher } from '../types'

// В рантайме Algorithm.Argon2id === 2, но в .d.ts @node-rs/argon2 Algorithm — const enum, а к нему
// при verbatimModuleSyntax TypeScript не даёт обратиться как к значению
const ARGON2ID_ALGORITHM = 2
const ARGON2_MEMORY_COST_KIB = 19456
const ARGON2_TIME_COST = 2
const ARGON2_PARALLELISM = 1

// Минимум OWASP для argon2id. Те же параметры у dummy-хэша — иначе время сверки выдало бы, есть ли учитель
export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID_ALGORITHM,
  memoryCost: ARGON2_MEMORY_COST_KIB,
  timeCost: ARGON2_TIME_COST,
  parallelism: ARGON2_PARALLELISM,
} as const

const DUMMY_PASSWORD_BYTES = 32
// Задачи argon2 идут в пул libuv (по умолчанию 4 потока), очередь без потолка растёт при наплыве входов.
// Значение уточняется нагрузочной проверкой перед деплоем
export const MAX_PENDING_HASH_JOBS = 32
const HASH_QUEUE_RETRY_AFTER_SECONDS = 5

export async function makePasswordHasher(): Promise<PasswordHasher> {
  const dummyHash = await hash(randomBytes(DUMMY_PASSWORD_BYTES), ARGON2_OPTIONS)
  let pendingJobs = 0

  // Считаются все задачи, включая сверку с dummy-хэшем: 503 не выдаёт, есть ли учитель
  async function runJob<T>(job: () => Promise<T>): Promise<T> {
    if (pendingJobs >= MAX_PENDING_HASH_JOBS) throw new ServiceBusyError(HASH_QUEUE_RETRY_AFTER_SECONDS)

    pendingJobs++
    try {
      return await job()
    } finally {
      pendingJobs--
    }
  }

  async function safeVerify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, password)
    } catch {
      // Битый хэш в базе — это «неверный пароль», а не 500
      return false
    }
  }

  return {
    hasCapacity: () => pendingJobs < MAX_PENDING_HASH_JOBS,

    hash: (password) => runJob(() => hash(password, ARGON2_OPTIONS)),

    verify: (storedHash, password) =>
      runJob(async () => {
        if (storedHash !== null) return safeVerify(storedHash, password)

        await safeVerify(dummyHash, password)
        return false
      }),
  }
}
