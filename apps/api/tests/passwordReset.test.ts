import { randomUUID } from 'node:crypto'
import { inspect } from 'node:util'
import { forgotPasswordSchema, resetPasswordSchema } from '@nataskium/shared/schemas'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PASSWORD_RESET_TTL_MS, makeRequestPasswordReset, makeResetPassword, makeTokenService } from '../src/features/auth'
import type { EmailSender, TeacherAccount } from '../src/features/auth/types'
import { AppError } from '../src/shared/errors'
import {
  type CallLog,
  flushBackground,
  makeFakeHasher,
  makeFakeQuota,
  makeFakeTeachers,
  makeMemoryPasswordResets,
  makeMemoryRefreshTokens,
} from './fakes/authFakes'
import { makeRecordingEmailSender } from './fakes/recordingEmailSender'

const NOW = new Date('2026-11-06T12:00:00Z')
const EXPECTED_TTL_MS = 60 * 60 * 1000
const EMAIL = 'qa-anna@example.test'
const NEW_PASSWORD = 'qa-new-correct-horse-2026'
const INVALID_RESET = { status: 400, message: 'The reset link is invalid or expired, request a new one' }
const HEX_64 = /^[0-9a-f]{64}$/
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

const TEACHER: TeacherAccount = {
  id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
  email: EMAIL,
  displayName: 'Анна',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
  googleId: null,
  emailVerifiedAt: NOW,
}

let calls: CallLog

function setupRequest(options: { accounts?: TeacherAccount[]; quota?: number; emailSender?: EmailSender } = {}) {
  const resets = makeMemoryPasswordResets(calls)
  const email = makeRecordingEmailSender()
  const { quota, state } = makeFakeQuota(calls)
  if (options.quota !== undefined) state.remaining = options.quota
  const request = makeRequestPasswordReset({
    teachers: makeFakeTeachers(calls, options.accounts ?? [TEACHER]).teachers,
    passwordResets: resets.repository,
    tokens,
    emailSender: options.emailSender ?? email.sender,
    resetEmailQuota: quota,
    now: () => NOW,
  })
  return { request, resets, email }
}

function setupReset(options: { emailSender?: EmailSender } = {}) {
  const refresh = makeMemoryRefreshTokens(calls)
  const resets = makeMemoryPasswordResets(calls, { refreshTokens: refresh })
  const hasher = makeFakeHasher(calls)
  const email = makeRecordingEmailSender()
  const resetPassword = makeResetPassword({
    passwordResets: resets.repository,
    hasher: hasher.hasher,
    tokens,
    emailSender: options.emailSender ?? email.sender,
    now: () => NOW,
  })

  function seedLink(options: { expiresAt?: Date; teacherId?: string } = {}) {
    const raw = tokens.generateOpaqueToken()
    resets.rows.push({
      id: randomUUID(),
      teacherId: options.teacherId ?? TEACHER.id,
      tokenHash: tokens.hashOpaqueToken(raw),
      expiresAt: options.expiresAt ?? new Date(NOW.getTime() + EXPECTED_TTL_MS),
    })
    return raw
  }

  function seedSession(teacherId: string) {
    refresh.seed({
      teacherId,
      familyId: randomUUID(),
      familyExpiresAt: new Date(NOW.getTime() + 30 * 24 * EXPECTED_TTL_MS),
      tokenHash: tokens.hashOpaqueToken(tokens.generateOpaqueToken()),
      expiresAt: new Date(NOW.getTime() + 14 * 24 * EXPECTED_TTL_MS),
    })
  }

  return { resetPassword, resets, refresh, hasher, email, seedLink, seedSession }
}

function resetInput(token: string, password = NEW_PASSWORD) {
  return resetPasswordSchema.parse({ token, password })
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('requestPasswordReset', () => {
  it('PASSWORD_RESET_TTL_MS — 1 час', () => {
    expect(PASSWORD_RESET_TTL_MS).toBe(EXPECTED_TTL_MS)
  })

  it('учителя удалили между поиском и записью (replaceForTeacher → false) — тот же ответ без ошибки, письма нет', async () => {
    const { request, resets, email } = setupRequest()
    resets.state.teacherGone = true

    await expect(request(forgotPasswordSchema.parse({ email: EMAIL }))).resolves.toBeUndefined()
    await flushBackground()

    expect(email.sent).toEqual([])
    expect(resets.rows).toEqual([])
    expect(calls).toContain('passwordResets.replaceForTeacher')
  })

  it('учитель с паролем: запись с HMAC токена и сроком now + 1 ч, письмо с сырым токеном и именем', async () => {
    const { request, resets, email } = setupRequest()

    await request(forgotPasswordSchema.parse({ email: ' QA-Anna@Example.TEST ' }))
    await flushBackground()

    expect(email.sent).toEqual([{ kind: 'passwordReset', to: EMAIL, rawToken: expect.stringMatching(BASE64URL_43), displayName: 'Анна' }])
    const [sent] = email.sent
    const rawToken = sent?.kind === 'passwordReset' ? sent.rawToken : ''
    expect(resets.rows).toEqual([
      { id: expect.any(String), teacherId: TEACHER.id, tokenHash: tokens.hashOpaqueToken(rawToken), expiresAt: new Date(NOW.getTime() + EXPECTED_TTL_MS) },
    ])
    expect(resets.rows[0]?.tokenHash).toMatch(HEX_64)
    expect(JSON.stringify(resets.rows)).not.toContain(rawToken)
  })

  it.each([
    ['учителя нет', []],
    ['вход только через Google', [{ ...TEACHER, passwordHash: null, googleId: 'google-sub-1' }]],
  ])('%s — ответ тот же, без записи и без письма', async (_name, accounts) => {
    const { request, resets, email } = setupRequest({ accounts })

    await expect(request({ email: EMAIL })).resolves.toBeUndefined()
    await flushBackground()

    expect(resets.rows).toEqual([])
    expect(email.sent).toEqual([])
  })

  // Иначе по расходу бюджета было бы видно, есть ли аккаунт
  it.each([
    ['учитель есть', [TEACHER]],
    ['учителя нет', []],
  ])('бюджет писем тратится до поиска учителя: %s', async (_name, accounts) => {
    const { request } = setupRequest({ accounts })

    await request({ email: EMAIL })

    expect(calls.slice(0, 2)).toEqual([`quota.tryConsume:${EMAIL}`, 'teachers.findByEmail'])
  })

  it('бюджет исчерпан — учитель не ищется, ни записи, ни письма', async () => {
    const { request, resets, email } = setupRequest({ quota: 0 })

    await expect(request({ email: EMAIL })).resolves.toBeUndefined()
    await flushBackground()

    expect(calls).toEqual([`quota.tryConsume:${EMAIL}`])
    expect(resets.rows).toEqual([])
    expect(email.sent).toEqual([])
  })

  it('новый запрос заменяет прежнюю ссылку: запись одна, старый токен не найти', async () => {
    const { request, resets, email } = setupRequest()

    await request({ email: EMAIL })
    await request({ email: EMAIL })
    await flushBackground()

    const [first, second] = email.sent.map((sent) => (sent.kind === 'passwordReset' ? sent.rawToken : ''))
    expect(resets.rows).toHaveLength(1)
    expect(resets.rows[0]?.tokenHash).toBe(tokens.hashOpaqueToken(second ?? ''))
    expect(await resets.repository.findByTokenHash(tokens.hashOpaqueToken(first ?? ''))).toBeNull()
  })

  it('сбой почты не ломает ответ; в логе нет email и токена', async () => {
    const logged: unknown[] = []
    for (const method of ['error', 'warn', 'info', 'log'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args)
      })
    }
    const sentTokens: string[] = []
    const failing = makeRecordingEmailSender().sender
    failing.sendPasswordResetEmail = async (to, rawToken) => {
      sentTokens.push(rawToken)
      throw new Error(`Resend rejected ${to} https://nataskium.example/auth/reset-password#token=${rawToken}`)
    }
    const { request } = setupRequest({ emailSender: failing })

    await expect(request({ email: EMAIL })).resolves.toBeUndefined()
    await flushBackground()

    const text = inspect(logged, { depth: null })
    expect(text).toContain('passwordReset.request')
    expect(text).not.toContain(EMAIL)
    expect(text).not.toContain(sentTokens[0])
  })
})

describe('resetPassword: отказ', () => {
  it.each([
    ['неизвестная ссылка', () => tokens.generateOpaqueToken(), {}],
    ['ссылка истекла', null, { expiresAt: new Date(NOW.getTime() - 1) }],
    ['ссылка истекает ровно сейчас', null, { expiresAt: NOW }],
  ])('%s — 400 без хэширования и без смены пароля', async (_name, makeToken, link) => {
    const { resetPassword, seedLink, resets } = setupReset()
    const raw = seedLink(link)

    const error = await rejectionOf(resetPassword(resetInput(makeToken?.() ?? raw)))

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject(INVALID_RESET)
    expect(calls).toEqual(['passwordResets.findByTokenHash'])
    expect(resets.passwordChanges).toEqual([])
  })

  it('ссылка уже использована — тот же 400', async () => {
    const { resetPassword, seedLink } = setupReset()
    const raw = seedLink()
    await resetPassword(resetInput(raw))

    expect(await rejectionOf(resetPassword(resetInput(raw, 'qa-another-strong-pass')))).toMatchObject(INVALID_RESET)
  })

  it('учителя удалили между поиском и сменой (completeReset → invalid) — тот же 400', async () => {
    const { resetPassword, seedLink, resets, email } = setupReset()
    const raw = seedLink()
    resets.state.teacherExists = false

    expect(await rejectionOf(resetPassword(resetInput(raw)))).toMatchObject(INVALID_RESET)
    await flushBackground()
    expect(email.sent).toEqual([])
  })

  it('все отказы неотличимы', async () => {
    const unknown = setupReset()
    const expired = setupReset()
    const used = setupReset()
    const usedRaw = used.seedLink()
    await used.resetPassword(resetInput(usedRaw))

    const errors = await Promise.all([
      rejectionOf(unknown.resetPassword(resetInput(tokens.generateOpaqueToken()))),
      rejectionOf(expired.resetPassword(resetInput(expired.seedLink({ expiresAt: NOW })))),
      rejectionOf(used.resetPassword(resetInput(usedRaw))),
    ])

    expect(new Set(errors.map((error) => JSON.stringify([(error as AppError).status, (error as AppError).message]))).size).toBe(1)
  })
})

describe('resetPassword: успех', () => {
  it('новый хэш пароля, все сессии учителя закрыты, чужие живы, сессия не выдаётся', async () => {
    const { resetPassword, seedLink, seedSession, refresh, resets, hasher } = setupReset()
    seedSession(TEACHER.id)
    seedSession(TEACHER.id)
    seedSession('0b9d8c7a-6f5e-4d3c-8b2a-1f0e9d8c7b6a')
    const raw = seedLink()

    await expect(resetPassword(resetInput(raw))).resolves.toBeUndefined()

    expect(resets.passwordChanges).toEqual([{ teacherId: TEACHER.id, passwordHash: hasher.hashOf(NEW_PASSWORD) }])
    expect(refresh.rows.map((row) => row.teacherId)).toEqual(['0b9d8c7a-6f5e-4d3c-8b2a-1f0e9d8c7b6a'])
    expect(resets.rows).toEqual([])
  })

  it('шаги по порядку: поиск, хэш нового пароля, CAS', async () => {
    const { resetPassword, seedLink } = setupReset()

    await resetPassword(resetInput(seedLink()))

    expect(calls).toEqual(['passwordResets.findByTokenHash', 'hasher.hash', 'passwordResets.completeReset'])
  })

  it('completeReset получает то же now, по которому проверялся срок', async () => {
    const { resetPassword, seedLink, resets } = setupReset()

    await resetPassword(resetInput(seedLink()))

    expect(resets.state.completedAt).toBe(NOW)
  })

  it('пароль хэшируется после NFC из passwordSchema', async () => {
    const { resetPassword, seedLink, resets, hasher } = setupReset()

    await resetPassword(resetInput(seedLink(), 'qa-cafe\u0301-2026-strong'))

    expect(resets.passwordChanges[0]?.passwordHash).toBe(hasher.hashOf('qa-café-2026-strong'))
  })
})

describe('resetPassword: письмо «пароль изменён»', () => {
  it('после успеха — одно письмо учителю с его именем, без токена', async () => {
    const { resetPassword, seedLink, email } = setupReset()
    const raw = seedLink()

    await resetPassword(resetInput(raw))
    await flushBackground()

    expect(email.sent).toEqual([{ kind: 'passwordChanged', to: EMAIL, displayName: 'Анна' }])
    expect(JSON.stringify(email.sent)).not.toContain(raw)
  })

  it('адрес и имя — из completeReset, то есть из базы на момент сброса', async () => {
    const { resetPassword, seedLink, resets, email } = setupReset()
    resets.state.teacher = { email: 'qa-renamed@example.test', displayName: null }

    await resetPassword(resetInput(seedLink()))
    await flushBackground()

    expect(email.sent).toEqual([{ kind: 'passwordChanged', to: 'qa-renamed@example.test', displayName: null }])
  })

  it.each([
    ['неизвестная ссылка', 'unknown'],
    ['ссылка уже использована', 'used'],
  ])('отказ (%s) — письма нет', async (_name, kind) => {
    const { resetPassword, seedLink, email } = setupReset()
    const raw = seedLink()
    if (kind === 'used') await resetPassword(resetInput(raw))
    await flushBackground()
    email.sent.length = 0

    await rejectionOf(resetPassword(resetInput(kind === 'unknown' ? tokens.generateOpaqueToken() : raw)))
    await flushBackground()

    expect(email.sent).toEqual([])
  })

  it('письмо в фоне: сбой почты не меняет успешный ответ, в логе нет адреса', async () => {
    const logged: unknown[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args)
    })
    const failing = makeRecordingEmailSender({ failWith: new Error(`Resend rejected ${EMAIL}`) })
    const { resetPassword, seedLink, resets } = setupReset({ emailSender: failing.sender })

    await expect(resetPassword(resetInput(seedLink()))).resolves.toBeUndefined()
    await flushBackground()

    expect(resets.passwordChanges).toHaveLength(1)
    expect(inspect(logged, { depth: null })).toContain('passwordReset.changed')
    expect(inspect(logged, { depth: null })).not.toContain(EMAIL)
  })

  it('письмо не задерживает ответ: зависшая отправка не мешает завершиться', async () => {
    const hanging = makeRecordingEmailSender().sender
    hanging.sendPasswordChangedEmail = () => new Promise(() => {})
    const { resetPassword, seedLink } = setupReset({ emailSender: hanging })

    await expect(resetPassword(resetInput(seedLink()))).resolves.toBeUndefined()
  })
})

describe('схемы сброса пароля', () => {
  it.each([
    ['популярный', 'qwerty', 'Password is too common'],
    ['короткий', 'abc', 'Password must be at least 4 characters'],
    ['повтор символа', 'aaaa', 'Password is too common'],
  ])('новый пароль по правилам регистрации: %s → ошибка', (_name, password, message) => {
    const result = resetPasswordSchema.safeParse({ token: tokens.generateOpaqueToken(), password })

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([message])
  })

  it('неверный токен — Invalid token', () => {
    expect(resetPasswordSchema.safeParse({ token: 'short', password: NEW_PASSWORD }).error?.issues[0]?.message).toBe('Invalid token')
  })

  it('forgotPassword: email нормализуется, лишние поля отбрасываются', () => {
    expect(forgotPasswordSchema.parse({ email: ' QA-Anna@Example.TEST ', password: 'x' })).toEqual({ email: EMAIL })
  })
})
