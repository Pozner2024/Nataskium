import { randomUUID } from 'node:crypto'
import type {
  ActivationResult,
  EmailQuota,
  FailureLimiter,
  FailureReservation,
  NewPendingRegistration,
  NewRefreshToken,
  PasswordHasher,
  PendingRegistration,
  PendingRegistrationRepository,
  RefreshTokenRepository,
  TeacherAccount,
  TeacherRepository,
} from '../../src/features/auth/types'
import { ServiceBusyError } from '../../src/shared/errors'

// Фейки для unit-тестов use-case: всё в памяти, каждый вызов пишется в общий журнал calls — по нему видно порядок шагов
export type CallLog = string[]

const FAKE_HASH_PREFIX = '$argon2id$fake$'
const RETRY_AFTER_SECONDS = 60
const BUSY_RETRY_AFTER_SECONDS = 5

// Хэш «как argon2id», но мгновенный: проверки порядка шагов не ждут настоящего argon2
export function makeFakeHasher(calls: CallLog) {
  const state = { busy: false, busyOnVerify: false }
  const hasher: PasswordHasher = {
    hasCapacity: () => !state.busy,
    assertCapacity() {
      calls.push('hasher.assertCapacity')
      if (state.busy) throw new ServiceBusyError(BUSY_RETRY_AFTER_SECONDS)
    },
    async hash(password) {
      calls.push('hasher.hash')
      return `${FAKE_HASH_PREFIX}${password}`
    },
    async verify(storedHash, password) {
      calls.push(storedHash === null ? 'hasher.verify(dummy)' : 'hasher.verify')
      if (state.busyOnVerify) throw new ServiceBusyError(BUSY_RETRY_AFTER_SECONDS)
      return storedHash === `${FAKE_HASH_PREFIX}${password}`
    },
  }
  return { hasher, state, hashOf: (password: string) => `${FAKE_HASH_PREFIX}${password}` }
}

export function makeFakeQuota(calls: CallLog) {
  const state = { remaining: Number.POSITIVE_INFINITY }
  const quota: EmailQuota = {
    tryConsume(email) {
      calls.push(`quota.tryConsume:${email}`)
      if (state.remaining <= 0) return false
      state.remaining--
      return true
    },
  }
  return { quota, state }
}

// failures — резервы, которые не сняли: столько неудачных попыток засчитано
export function makeFakeLimiter(calls: CallLog) {
  const state = { blocked: false, failures: 0, reservations: 0 }
  const limiter: FailureLimiter = {
    reserve(key): FailureReservation {
      calls.push(`limiter.reserve:${key}`)
      if (state.blocked) return { allowed: false, retryAfterSeconds: RETRY_AFTER_SECONDS }
      state.reservations++
      state.failures++
      let released = false
      return {
        allowed: true,
        release() {
          calls.push('limiter.release')
          if (released) return
          released = true
          state.failures--
        },
      }
    },
  }
  return { limiter, state, retryAfterSeconds: RETRY_AFTER_SECONDS }
}

export function makeFakeTeachers(calls: CallLog, accounts: TeacherAccount[] = []) {
  const teachers: TeacherRepository = {
    async findByEmail(email) {
      calls.push('teachers.findByEmail')
      return accounts.find((account) => account.email === email) ?? null
    },
    async findById(id) {
      return accounts.find((account) => account.id === id) ?? null
    },
  }
  return { teachers, accounts }
}

type StoredPending = PendingRegistration & { tokenHash: string }

export function makeFakePendingRegistrations(calls: CallLog) {
  const rows: StoredPending[] = []
  const state: { activation: ActivationResult['status'] | 'auto'; activatedAt: Date | null } = {
    activation: 'auto',
    activatedAt: null,
  }

  function teacherFrom(registration: PendingRegistration): TeacherAccount {
    return {
      id: randomUUID(),
      email: registration.email,
      displayName: registration.displayName,
      passwordHash: registration.passwordHash,
      googleId: null,
      emailVerifiedAt: new Date(),
    }
  }

  const repository: PendingRegistrationRepository = {
    async create(registration: NewPendingRegistration) {
      calls.push('pending.create')
      rows.push({ id: randomUUID(), ...registration })
    },
    async findByTokenHash(tokenHash) {
      calls.push('pending.findByTokenHash')
      const row = rows.find((candidate) => candidate.tokenHash === tokenHash)
      if (row === undefined) return null
      // Как настоящий репозиторий: хэш токена наружу не отдаётся
      return { id: row.id, email: row.email, passwordHash: row.passwordHash, displayName: row.displayName, expiresAt: row.expiresAt }
    },
    async activate(registration, tokenHash, now): Promise<ActivationResult> {
      calls.push('pending.activate')
      state.activatedAt = now
      if (state.activation === 'alreadyUsed') return { status: 'alreadyUsed' }
      if (state.activation === 'emailTaken') return { status: 'emailTaken' }

      const index = rows.findIndex((row) => row.id === registration.id && row.tokenHash === tokenHash)
      if (index === -1) return { status: 'alreadyUsed' }
      rows.splice(index, 1)
      return { status: 'activated', teacher: teacherFrom(registration) }
    },
    async deleteExpired() {
      return 0
    },
  }
  return { repository, rows, state }
}

export function makeFakeRefreshTokens(calls: CallLog) {
  const families: { token: NewRefreshToken; maxFamilies: number }[] = []
  const repository: RefreshTokenRepository = {
    async createFamily(token, maxFamilies) {
      calls.push('refreshTokens.createFamily')
      families.push({ token, maxFamilies })
    },
    async findByHash() {
      return null
    },
    async rotate() {
      return false
    },
    async deleteFamily() {},
    async deleteAllForTeacher() {},
    async deleteExpired() {
      return 0
    },
  }
  return { repository, families }
}

// Письма уходят через sendInBackground без await: даём фоновым промисам завершиться
export function flushBackground(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
