import { randomUUID } from 'node:crypto'
import type {
  ActivationResult,
  EmailQuota,
  FailureLimiter,
  FailureReservation,
  GoogleLinkResult,
  NewPasswordReset,
  NewPendingGoogleLink,
  PendingGoogleLinkRepository,
  NewPendingRegistration,
  NewRefreshToken,
  PasswordHasher,
  PasswordReset,
  PasswordResetRepository,
  PasswordResetResult,
  PendingRegistration,
  PendingRegistrationRepository,
  RefreshSession,
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
  // maxFailures — как настоящий лимитер: после стольких засчитанных неудач новые резервы не выдаются
  const state = { blocked: false, failures: 0, reservations: 0, maxFailures: Number.POSITIVE_INFINITY }
  const limiter: FailureLimiter = {
    reserve(key): FailureReservation {
      calls.push(`limiter.reserve:${key}`)
      if (state.blocked || state.failures >= state.maxFailures) return { allowed: false, retryAfterSeconds: RETRY_AFTER_SECONDS }
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
    // Та же логика, что в репозитории: по googleId; учитель с этим email без Google — нужен пароль; иначе новый учитель
    async signInWithGoogle(profile, now) {
      calls.push('teachers.signInWithGoogle')
      const linked = accounts.find((account) => account.googleId === profile.googleId)
      if (linked !== undefined) return { status: 'signedIn', teacher: linked }

      const existing = accounts.find((account) => account.email === profile.email)
      if (existing !== undefined) {
        if (existing.googleId !== null) return { status: 'conflict' }
        return { status: 'passwordRequired', teacherId: existing.id }
      }

      const teacher: TeacherAccount = {
        id: randomUUID(),
        email: profile.email,
        displayName: profile.displayName,
        passwordHash: null,
        googleId: profile.googleId,
        emailVerifiedAt: now,
      }
      accounts.push(teacher)
      return { status: 'signedIn', teacher }
    },
    // false — учителя уже нет (параллельное удаление)
    async deleteAccount(teacherId, email) {
      calls.push(`teachers.deleteAccount:${email}`)
      const index = accounts.findIndex((account) => account.id === teacherId)
      if (index === -1) return false
      accounts.splice(index, 1)
      return true
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
  // teacherGone — учителя удалили до записи: настоящий репозиторий ловит P2003 и возвращает false
  const state = { teacherGone: false }
  const repository: RefreshTokenRepository = {
    async createFamily(token, maxFamilies) {
      calls.push('refreshTokens.createFamily')
      if (state.teacherGone) return false
      families.push({ token, maxFamilies })
      return true
    },
    async findByHash() {
      return null
    },
    async rotate() {
      return 'alreadyUsed'
    },
    async deleteFamily() {},
    async deleteAllForTeacher() {},
    async deleteExpired() {
      return 0
    },
  }
  return { repository, families, state }
}

// Письма уходят через sendInBackground без await: даём фоновым промисам завершиться
export function flushBackground(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

type StoredRefresh = RefreshSession & { tokenHash: string }

// Refresh-токены в памяти с настоящим CAS в rotate: для refresh, logout и logoutAll
export function makeMemoryRefreshTokens(calls: CallLog) {
  const rows: StoredRefresh[] = []
  const rotations: { oldTokenId: string; next: NewRefreshToken; now: Date }[] = []
  // rotateFails — токен успели ротировать параллельно; teacherGone — учителя удалили до записи (P2003): запись откатывается
  // rotateConflict — PostgreSQL прервал транзакцию ротации (P2034): ничего не записано
  const state = { rotateFails: false, teacherGone: false, rotateConflict: false }

  function seed(token: NewRefreshToken & { revokedAt?: Date | null }): StoredRefresh {
    const row = { id: randomUUID(), revokedAt: null, ...token }
    rows.push(row)
    return row
  }

  function removeWhere(matches: (row: StoredRefresh) => boolean) {
    for (let index = rows.length - 1; index >= 0; index--) {
      const row = rows[index]
      if (row !== undefined && matches(row)) rows.splice(index, 1)
    }
  }

  const repository: RefreshTokenRepository = {
    async createFamily(token) {
      calls.push('refreshTokens.createFamily')
      if (state.teacherGone) return false
      seed(token)
      return true
    },
    async findByHash(tokenHash) {
      calls.push('refreshTokens.findByHash')
      const row = rows.find((candidate) => candidate.tokenHash === tokenHash)
      if (row === undefined) return null
      return {
        id: row.id,
        teacherId: row.teacherId,
        familyId: row.familyId,
        familyExpiresAt: row.familyExpiresAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
      }
    },
    async rotate(oldTokenId, next, now) {
      calls.push('refreshTokens.rotate')
      rotations.push({ oldTokenId, next, now })
      const old = rows.find((row) => row.id === oldTokenId && row.revokedAt === null)
      if (state.rotateFails || old === undefined) return 'alreadyUsed'
      if (state.teacherGone) return 'teacherGone'
      if (state.rotateConflict) return 'conflict'
      old.revokedAt = now
      seed(next)
      return 'rotated'
    },
    async deleteFamily(familyId) {
      calls.push(`refreshTokens.deleteFamily:${familyId}`)
      removeWhere((row) => row.familyId === familyId)
    },
    async deleteAllForTeacher(teacherId) {
      calls.push(`refreshTokens.deleteAllForTeacher:${teacherId}`)
      removeWhere((row) => row.teacherId === teacherId)
    },
    async deleteExpired() {
      return 0
    },
  }
  return { repository, rows, rotations, state, seed }
}

type StoredReset = PasswordReset & { tokenHash: string }

// Ссылки сброса в памяти с CAS в completeReset: удаляет запись, и если удалось — меняет пароль и закрывает сессии
export function makeMemoryPasswordResets(calls: CallLog, options: { refreshTokens?: { rows: { teacherId: string }[] } } = {}) {
  const rows: StoredReset[] = []
  const passwordChanges: { teacherId: string; passwordHash: string }[] = []
  // teacher — кому completeReset сообщит о смене пароля
  // teacherGone — учителя удалили до записи ссылки (P2003): replaceForTeacher → false
  const state: { teacherExists: boolean; teacherGone: boolean; completedAt: Date | null; teacher: { email: string; displayName: string | null } } = {
    teacherExists: true,
    teacherGone: false,
    completedAt: null,
    teacher: { email: 'qa-anna@example.test', displayName: 'Анна' },
  }

  const repository: PasswordResetRepository = {
    async replaceForTeacher(reset: NewPasswordReset) {
      calls.push('passwordResets.replaceForTeacher')
      if (state.teacherGone) return false
      for (let index = rows.length - 1; index >= 0; index--) if (rows[index]?.teacherId === reset.teacherId) rows.splice(index, 1)
      rows.push({ id: randomUUID(), ...reset })
      return true
    },
    async findByTokenHash(tokenHash) {
      calls.push('passwordResets.findByTokenHash')
      const row = rows.find((candidate) => candidate.tokenHash === tokenHash)
      return row === undefined ? null : { id: row.id, teacherId: row.teacherId, expiresAt: row.expiresAt }
    },
    async completeReset(reset, tokenHash, passwordHash, now): Promise<PasswordResetResult> {
      calls.push('passwordResets.completeReset')
      state.completedAt = now
      const index = rows.findIndex((row) => row.id === reset.id && row.tokenHash === tokenHash && row.expiresAt > now)
      if (index === -1) return { status: 'invalid' }
      rows.splice(index, 1)
      if (!state.teacherExists) return { status: 'invalid' }
      for (let other = rows.length - 1; other >= 0; other--) if (rows[other]?.teacherId === reset.teacherId) rows.splice(other, 1)
      const refreshRows = options.refreshTokens?.rows
      if (refreshRows) for (let other = refreshRows.length - 1; other >= 0; other--) if (refreshRows[other]?.teacherId === reset.teacherId) refreshRows.splice(other, 1)
      passwordChanges.push({ teacherId: reset.teacherId, passwordHash })
      return { status: 'reset', teacher: state.teacher }
    },
    async deleteExpired() {
      return 0
    },
  }
  return { repository, rows, passwordChanges, state }
}

type StoredGoogleLink = NewPendingGoogleLink & { id: string }

// Незавершённые привязки Google в памяти: одна на учителя, CAS в completeLink. accounts — учителя из makeFakeTeachers:
// из них берутся email и хэш пароля, в них же записывается googleId
export function makeMemoryPendingGoogleLinks(calls: CallLog, accounts: TeacherAccount[]) {
  const rows: StoredGoogleLink[] = []
  // teacherGone — учителя удалили до записи привязки (P2003): replaceForTeacher → false
  const state: { completedAt: Date | null; teacherGone: boolean } = { completedAt: null, teacherGone: false }

  const repository: PendingGoogleLinkRepository = {
    async replaceForTeacher(link) {
      calls.push('googleLinks.replaceForTeacher')
      if (state.teacherGone) return false
      const index = rows.findIndex((row) => row.teacherId === link.teacherId)
      if (index !== -1) rows.splice(index, 1)
      rows.push({ id: randomUUID(), ...link })
      return true
    },
    async findByTokenHash(tokenHash) {
      calls.push('googleLinks.findByTokenHash')
      const row = rows.find((candidate) => candidate.tokenHash === tokenHash)
      const teacher = accounts.find((account) => account.id === row?.teacherId)
      if (row === undefined || teacher === undefined) return null
      return {
        id: row.id,
        teacherId: row.teacherId,
        googleId: row.googleId,
        linkSecretHash: row.linkSecretHash,
        expiresAt: row.expiresAt,
        teacherEmail: teacher.email,
        teacherPasswordHash: teacher.passwordHash,
      }
    },
    async completeLink(link, tokenHash, now): Promise<GoogleLinkResult> {
      calls.push('googleLinks.completeLink')
      state.completedAt = now
      const index = rows.findIndex((row) => row.id === link.id && row.tokenHash === tokenHash && row.expiresAt > now)
      if (index === -1) return { status: 'invalid' }
      rows.splice(index, 1)
      const teacher = accounts.find((account) => account.id === link.teacherId)
      if (teacher === undefined) return { status: 'invalid' }
      const takenByOther = accounts.some((account) => account.id !== teacher.id && account.googleId === link.googleId)
      if (takenByOther || (teacher.googleId !== null && teacher.googleId !== link.googleId)) return { status: 'conflict' }
      teacher.googleId = link.googleId
      return { status: 'linked', teacher }
    },
    async deleteExpired() {
      return 0
    },
  }
  return { repository, rows, state }
}
