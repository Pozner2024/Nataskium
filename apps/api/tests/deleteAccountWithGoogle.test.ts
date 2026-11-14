import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDeleteAccountWithGoogle, type DeleteAccountWithGoogleInput } from '../src/features/auth/application/deleteAccountWithGoogle'
import { makeTokenService } from '../src/features/auth'
import type { GoogleExchangeResult, TeacherAccount } from '../src/features/auth/types'
import { flushBackground, makeMemoryPendingGoogleReauths } from './fakes/authFakes'
import { makeRecordingEmailSender } from './fakes/recordingEmailSender'
import { makeMemoryTeacherImages } from './fakes/teacherImageFakes'

const NOW = new Date('2026-11-13T10:00:00Z')
const FIVE_MINUTES_MS = 5 * 60 * 1000
const tokens = makeTokenService({ jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef', hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef' })
const GOOGLE_SUB = 'google-sub-anna'
const ANNA: TeacherAccount = { id: 'teacher-anna', email: 'qa-anna@gmail.com', displayName: 'Анна Ли', passwordHash: null, googleId: GOOGLE_SUB, emailVerifiedAt: NOW }
const BORIS: TeacherAccount = { id: 'teacher-boris', email: 'qa-boris@gmail.com', displayName: 'Борис', passwordHash: null, googleId: 'google-sub-boris', emailVerifiedAt: NOW }

type Exchange = GoogleExchangeResult

function profile(overrides: Partial<{ googleId: string }> = {}): Exchange {
  return {
    ok: true,
    profile: { googleId: GOOGLE_SUB, email: ANNA.email, emailVerified: true, name: 'Анна Ли', ...overrides },
  }
}

// Запись подтверждения, как её делает startGoogleReauth: по HMAC состояния, на срок 5 минут
async function reauthFor(accounts: TeacherAccount[], teacherId: string, state: string, expiresAt = new Date(NOW.getTime() + FIVE_MINUTES_MS)) {
  const reauths = makeMemoryPendingGoogleReauths([], accounts)
  await reauths.repository.replaceForTeacher({ teacherId, stateHash: tokens.hashOpaqueToken(state), expiresAt })
  return reauths
}

function makeUseCase(accounts: TeacherAccount[], reauths: ReturnType<typeof makeMemoryPendingGoogleReauths>, exchange: () => Promise<Exchange>, failWith?: Error) {
  const emails = makeRecordingEmailSender(failWith ? { failWith } : {})
  const exchangeCalls: string[] = []
  const useCase = makeDeleteAccountWithGoogle({
    pendingGoogleReauths: reauths.repository,
    google: {
      exchangeCode: async (code) => {
        exchangeCalls.push(code)
        return exchange()
      },
    },
    tokens,
    emailSender: emails.sender,
    now: () => NOW,
  })
  return { useCase, emails, exchangeCalls }
}

function input(state = 'state-anna', overrides: Partial<DeleteAccountWithGoogleInput> = {}): DeleteAccountWithGoogleInput {
  return { state, code: 'qa-code', codeVerifier: 'qa-verifier', nonce: 'qa-nonce', locale: 'ru', ...overrides }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('deleteAccountWithGoogle: успех', () => {
  it('вход в тот же Google-аккаунт — учитель и его запись удалены, письмо ушло на языке запроса', async () => {
    const accounts = [ANNA]
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna')
    const { useCase, emails } = makeUseCase(accounts, reauths, async () => profile())

    await expect(useCase(input())).resolves.toEqual({ ok: true })
    await flushBackground()

    expect(accounts).toEqual([])
    expect(reauths.rows).toEqual([])
    expect(emails.sent).toEqual([{ kind: 'accountDeleted', to: ANNA.email, displayName: 'Анна Ли', locale: 'ru' }])
  })

  it('письмо на языке запроса, а не по умолчанию', async () => {
    const accounts = [ANNA]
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna')
    const { useCase, emails } = makeUseCase(accounts, reauths, async () => profile())

    await useCase(input('state-anna', { locale: 'fr' }))
    await flushBackground()

    expect(emails.sent).toEqual([expect.objectContaining({ kind: 'accountDeleted', locale: 'fr' })])
  })

  it('сбой отправки письма не откатывает удаление', async () => {
    const accounts = [ANNA]
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna')
    const { useCase } = makeUseCase(accounts, reauths, async () => profile(), new Error('mail provider down'))

    await expect(useCase(input())).resolves.toEqual({ ok: true })
    await flushBackground()

    expect(accounts).toEqual([])
  })
})

describe('deleteAccountWithGoogle: отказ — аккаунт цел', () => {
  it('нет подтверждения для этого state — expired, Google не вызывается', async () => {
    const accounts = [ANNA]
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna')
    const { useCase, exchangeCalls } = makeUseCase(accounts, reauths, async () => profile())

    await expect(useCase(input('state-unknown'))).resolves.toEqual({ ok: false, reason: 'expired' })

    expect(exchangeCalls).toEqual([])
    expect(accounts).toEqual([ANNA])
  })

  it('подтверждение истекло — expired, Google не вызывается', async () => {
    const accounts = [ANNA]
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna', new Date(NOW.getTime() - 1))
    const { useCase, exchangeCalls } = makeUseCase(accounts, reauths, async () => profile())

    await expect(useCase(input())).resolves.toEqual({ ok: false, reason: 'expired' })

    expect(exchangeCalls).toEqual([])
    expect(accounts).toEqual([ANNA])
  })

  it('Google вернул другой аккаунт (sub не совпадает) — wrongAccount, аккаунт цел, подтверждение погашено', async () => {
    const accounts = [ANNA]
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna')
    const { useCase } = makeUseCase(accounts, reauths, async () => profile({ googleId: BORIS.googleId ?? 'other' }))

    await expect(useCase(input())).resolves.toEqual({ ok: false, reason: 'wrongAccount' })

    expect(accounts).toEqual([ANNA])
    expect(reauths.rows).toEqual([])
  })

  it('Google отклонил код или id_token — invalidToken, подтверждение погашено', async () => {
    const accounts = [ANNA]
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna')
    const { useCase } = makeUseCase(accounts, reauths, async () => ({ ok: false, reason: 'invalidToken' }))

    await expect(useCase(input())).resolves.toEqual({ ok: false, reason: 'invalidToken' })

    expect(accounts).toEqual([ANNA])
    expect(reauths.rows).toEqual([])
  })

  it('пароль появился после запуска — hasPassword, аккаунт цел, подтверждение погашено', async () => {
    const withPassword: TeacherAccount = { ...ANNA, passwordHash: 'argon2-hash' }
    const accounts = [withPassword]
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna')
    const { useCase, emails } = makeUseCase(accounts, reauths, async () => profile())

    await expect(useCase(input())).resolves.toEqual({ ok: false, reason: 'hasPassword' })
    await flushBackground()

    expect(accounts).toEqual([withPassword])
    expect(reauths.rows).toEqual([])
    expect(emails.sent).toEqual([])
  })

  it('учитель без googleId (вход только по паролю) — wrongAccount, аккаунт цел', async () => {
    const withPassword: TeacherAccount = { ...ANNA, googleId: null, passwordHash: 'argon2-hash' }
    const accounts = [withPassword]
    const reauths = await reauthFor(accounts, withPassword.id, 'state-anna')
    const { useCase } = makeUseCase(accounts, reauths, async () => profile())

    await expect(useCase(input())).resolves.toEqual({ ok: false, reason: 'wrongAccount' })

    expect(accounts).toEqual([withPassword])
  })
})

describe('deleteAccountWithGoogle: повтор и гонка', () => {
  it('тот же callback второй раз — expired, удаление было один раз', async () => {
    const accounts = [ANNA]
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna')
    const { useCase } = makeUseCase(accounts, reauths, async () => profile())

    await expect(useCase(input())).resolves.toEqual({ ok: true })
    await expect(useCase(input())).resolves.toEqual({ ok: false, reason: 'expired' })
  })

  it('два callback одновременно — аккаунт удалён один раз, второй получает expired', async () => {
    const accounts = [ANNA]
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna')
    const { useCase, emails } = makeUseCase(accounts, reauths, async () => profile())

    const results = await Promise.all([useCase(input()), useCase(input())])
    await flushBackground()

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results).toContainEqual({ ok: false, reason: 'expired' })
    expect(accounts).toEqual([])
    expect(emails.sent).toHaveLength(1)
  })
})

describe('deleteAccountWithGoogle: изоляция учителей', () => {
  it('запись другого учителя не подходит: state Бориса не удаляет Анну', async () => {
    const accounts = [ANNA, BORIS]
    const reauths = makeMemoryPendingGoogleReauths([], accounts)
    await reauths.repository.replaceForTeacher({ teacherId: ANNA.id, stateHash: tokens.hashOpaqueToken('state-anna'), expiresAt: new Date(NOW.getTime() + FIVE_MINUTES_MS) })
    await reauths.repository.replaceForTeacher({ teacherId: BORIS.id, stateHash: tokens.hashOpaqueToken('state-boris'), expiresAt: new Date(NOW.getTime() + FIVE_MINUTES_MS) })
    // Google вернул Бориса по его state: сверка с googleId записи Бориса, Анна не затрагивается
    const { useCase } = makeUseCase(accounts, reauths, async () => profile({ googleId: BORIS.googleId ?? 'x' }))

    await expect(useCase(input('state-boris'))).resolves.toEqual({ ok: true })

    expect(accounts.map((account) => account.id)).toEqual([ANNA.id])
    expect(reauths.rows.map((row) => row.teacherId)).toEqual([ANNA.id])
  })

  it('вход Анны по state Бориса (sub Анны) — wrongAccount, оба аккаунта целы', async () => {
    const accounts = [ANNA, BORIS]
    const reauths = makeMemoryPendingGoogleReauths([], accounts)
    await reauths.repository.replaceForTeacher({ teacherId: BORIS.id, stateHash: tokens.hashOpaqueToken('state-boris'), expiresAt: new Date(NOW.getTime() + FIVE_MINUTES_MS) })
    const { useCase } = makeUseCase(accounts, reauths, async () => profile())

    await expect(useCase(input('state-boris'))).resolves.toEqual({ ok: false, reason: 'wrongAccount' })

    expect(accounts).toHaveLength(2)
  })
})

describe('deleteAccountWithGoogle: логи', () => {
  it('в логах только id учителя: ни email, ни имени, ни googleId', async () => {
    const accounts = [ANNA]
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna')
    const { useCase } = makeUseCase(accounts, reauths, async () => profile())
    const info = vi.mocked(console.info)

    await useCase(input())
    await flushBackground()

    const logged = JSON.stringify(info.mock.calls)
    expect(logged).toContain(ANNA.id)
    for (const secret of [ANNA.email, 'Анна Ли', GOOGLE_SUB]) expect(logged).not.toContain(secret)
  })
})

describe('deleteAccountWithGoogle: файлы картинок учителя (GDPR)', () => {
  async function setupWithImages(accounts: TeacherAccount[]) {
    const reauths = await reauthFor(accounts, ANNA.id, 'state-anna')
    const images = await makeMemoryTeacherImages([ANNA.id, BORIS.id])
    const useCase = makeDeleteAccountWithGoogle({
      pendingGoogleReauths: reauths.repository,
      google: { exchangeCode: async () => profile() },
      tokens,
      emailSender: makeRecordingEmailSender().sender,
      now: () => NOW,
      imageFiles: images.files,
    })
    return { useCase, images }
  }

  it('после удаления файлы учителя удалены из хранилища, чужие на месте', async () => {
    const accounts = [ANNA, BORIS]
    const { useCase, images } = await setupWithImages(accounts)

    await expect(useCase(input())).resolves.toEqual({ ok: true })

    expect(accounts).toEqual([BORIS])
    for (const key of images.keysOf(ANNA.id)) expect(images.memory.objects.has(key)).toBe(false)
    for (const key of images.keysOf(BORIS.id)) expect(images.memory.objects.has(key)).toBe(true)
  })

  it('сбой хранилища — аккаунт всё равно удалён, результат ok, в логе нет id и ключей', async () => {
    const accounts = [ANNA]
    const { useCase, images } = await setupWithImages(accounts)
    images.failing.remove = true
    const errors = vi.mocked(console.error)

    await expect(useCase(input())).resolves.toEqual({ ok: true })

    expect(accounts).toEqual([])
    expect(errors).toHaveBeenCalledOnce()
    const logged = JSON.stringify(errors.mock.calls)
    expect(logged).not.toContain(ANNA.id)
    for (const key of images.keysOf(ANNA.id)) expect(logged).not.toContain(key)
  })

  it('пароль появился после запуска (hasPassword) — аккаунт цел, файлы на месте', async () => {
    const accounts: TeacherAccount[] = [{ ...ANNA, passwordHash: 'argon2-hash' }]
    const { useCase, images } = await setupWithImages(accounts)

    await expect(useCase(input())).resolves.toEqual({ ok: false, reason: 'hasPassword' })

    for (const key of images.keysOf(ANNA.id)) expect(images.memory.objects.has(key)).toBe(true)
  })
})
