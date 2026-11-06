import { randomUUID } from 'node:crypto'
import { inspect } from 'node:util'
import { googleLinkSchema } from '@nataskium/shared/schemas'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTokenService } from '../src/features/auth'
import { makeGoogleLink } from '../src/features/auth/application/googleLink'
import type { TeacherAccount } from '../src/features/auth/types'
import { AppError, RateLimitedError, ServiceBusyError } from '../src/shared/errors'
import {
  type CallLog,
  flushBackground,
  makeFakeHasher,
  makeFakeLimiter,
  makeFakeTeachers,
  makeMemoryPendingGoogleLinks,
  makeMemoryRefreshTokens,
} from './fakes/authFakes'
import { makeRecordingEmailSender } from './fakes/recordingEmailSender'

const NOW = new Date('2026-11-06T12:00:00Z')
const LINK_TTL_MS = 10 * 60 * 1000
const EMAIL = 'qa-anna@example.test'
const PASSWORD = 'qa-correct-horse-1957'
const GOOGLE_ID = 'google-sub-anna'
// Тот же текст, что при входе по паролю: по нему не понять, что именно не так
const INVALID_LINK = { status: 400, message: 'Wrong email or password' }
const LINK_CONFLICT = { status: 409, message: 'This Google account cannot be linked to this account' }

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

let calls: CallLog

function setup(options: { failEmail?: Error; others?: TeacherAccount[] } = {}) {
  const hasher = makeFakeHasher(calls)
  const teacher: TeacherAccount = {
    id: '6f1c2a4e-8d3b-4f5a-9c7e-1b2d3e4f5a6b',
    email: EMAIL,
    displayName: 'Анна Ли',
    passwordHash: hasher.hashOf(PASSWORD),
    googleId: null,
    emailVerifiedAt: NOW,
  }
  const { accounts } = makeFakeTeachers(calls, [teacher, ...(options.others ?? [])])
  const links = makeMemoryPendingGoogleLinks(calls, accounts)
  const limiter = makeFakeLimiter(calls)
  const refresh = makeMemoryRefreshTokens(calls)
  const email = makeRecordingEmailSender({ failWith: options.failEmail })
  const rawLink = makeGoogleLink({
    pendingGoogleLinks: links.repository,
    hasher: hasher.hasher,
    failureLimiter: limiter.limiter,
    emailSender: email.sender,
    refreshTokens: refresh.repository,
    tokens,
    now: () => NOW,
  })

  // Секрет из cookie браузера, в котором начался вход через Google
  const browser = { secret: tokens.generateOpaqueToken() }

  function seedLink(overrides: { expiresAt?: Date; googleId?: string } = {}) {
    const raw = tokens.generateOpaqueToken()
    browser.secret = tokens.generateOpaqueToken()
    links.rows.push({
      id: randomUUID(),
      teacherId: teacher.id,
      googleId: overrides.googleId ?? GOOGLE_ID,
      tokenHash: tokens.hashOpaqueToken(raw),
      linkSecretHash: tokens.hashOpaqueToken(browser.secret),
      expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + LINK_TTL_MS),
    })
    calls.length = 0
    return raw
  }

  // Подтверждение из того же браузера: с cookie этого входа
  const link = (body: ReturnType<typeof input>) => rawLink(body, browser.secret)

  return { link, rawLink, browser, teacher, accounts, links, hasher, limiter, refresh, email, seedLink }
}

function input(token: string, password = PASSWORD) {
  return googleLinkSchema.parse({ token, password })
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

describe('googleLink: ссылка неизвестна или истекла', () => {
  it.each([
    ['неизвестный токен', {}, true],
    ['срок истёк', { expiresAt: new Date(NOW.getTime() - 1) }, false],
    ['срок ровно сейчас', { expiresAt: NOW }, false],
  ])('%s — сверка с dummy-хэшем и тот же 400, лимит не тратится', async (_name, linkOptions, unknownToken) => {
    const { link, seedLink, limiter, teacher } = setup()
    const raw = seedLink(linkOptions)

    const error = await rejectionOf(link(input(unknownToken ? tokens.generateOpaqueToken() : raw)))

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject(INVALID_LINK)
    expect(calls).toEqual(['googleLinks.findByTokenHash', 'hasher.verify(dummy)'])
    expect(limiter.state.reservations).toBe(0)
    expect(teacher.googleId).toBeNull()
  })
})

// Ссылку /auth/link-google#token=… атакующий может прислать учителю: без cookie этого входа она не сработает
describe('googleLink: чужой браузер (CSRF)', () => {
  it.each([
    ['без cookie', () => undefined],
    ['cookie другого входа', () => tokens.generateOpaqueToken()],
    ['пустая cookie', () => ''],
    ['cookie — хэш, а не секрет', (secretHash: string) => secretHash],
  ])('%s — тот же 400, Google не привязан, неудача не засчитана, ссылка цела', async (_name, makeSecret) => {
    const { rawLink, browser, seedLink, limiter, teacher, links } = setup()
    const raw = seedLink()

    const error = await rejectionOf(rawLink(input(raw), makeSecret(tokens.hashOpaqueToken(browser.secret))))

    expect(error).toMatchObject(INVALID_LINK)
    expect(calls).toEqual(['googleLinks.findByTokenHash', 'hasher.verify(dummy)'])
    expect(limiter.state.reservations).toBe(0)
    expect(teacher.googleId).toBeNull()
    expect(links.rows).toHaveLength(1)
  })

  // Сравнение хэшей — целиком: секрет, хэш которого отличается от ожидаемого одним последним символом, не подходит.
  // hashOpaqueToken подменён тождественным, чтобы такой «почти совпадающий» хэш можно было задать
  it('хэш секрета совпадает со всеми символами, кроме последнего, — отказ', async () => {
    const identityTokens = { ...tokens, hashOpaqueToken: (value: string) => value }
    const hasher = makeFakeHasher(calls)
    const teacher: TeacherAccount = { id: randomUUID(), email: EMAIL, displayName: null, passwordHash: hasher.hashOf(PASSWORD), googleId: null, emailVerifiedAt: NOW }
    const links = makeMemoryPendingGoogleLinks(calls, [teacher])
    const expected = 'a'.repeat(63) + 'b'
    links.rows.push({ id: randomUUID(), teacherId: teacher.id, googleId: GOOGLE_ID, tokenHash: 'qa-token', linkSecretHash: expected, expiresAt: new Date(NOW.getTime() + LINK_TTL_MS) })
    const link = makeGoogleLink({
      pendingGoogleLinks: links.repository,
      hasher: hasher.hasher,
      failureLimiter: makeFakeLimiter(calls).limiter,
      emailSender: makeRecordingEmailSender().sender,
      refreshTokens: makeMemoryRefreshTokens(calls).repository,
      tokens: identityTokens,
      now: () => NOW,
    })

    for (const almost of ['a'.repeat(63) + 'c', 'b' + 'a'.repeat(62) + 'b', 'a'.repeat(63)]) {
      expect(await rejectionOf(link({ token: 'qa-token', password: PASSWORD }, almost))).toMatchObject(INVALID_LINK)
    }
    await expect(link({ token: 'qa-token', password: PASSWORD }, expected)).resolves.toMatchObject({ teacher: { id: teacher.id } })
  })

  it('чужой браузер с верным паролем неотличим от неверного токена', async () => {
    const csrf = setup()
    const unknown = setup()
    const raw = csrf.seedLink()

    const errors = await Promise.all([
      rejectionOf(csrf.rawLink(input(raw), undefined)),
      rejectionOf(unknown.link(input(tokens.generateOpaqueToken()))),
    ])

    expect(new Set(errors.map((error) => JSON.stringify([(error as AppError).status, (error as AppError).message]))).size).toBe(1)
  })

  it('после неудачи из чужого браузера владелец по-прежнему привязывает Google из своего', async () => {
    const { rawLink, link, seedLink, teacher } = setup()
    const raw = seedLink()
    await rejectionOf(rawLink(input(raw), undefined))

    await link(input(raw))

    expect(teacher.googleId).toBe(GOOGLE_ID)
  })
})

describe('googleLink: пароль', () => {
  it('неверный пароль — тот же 400, неудача засчитана по email учителя, ссылка цела, Google не привязан', async () => {
    const { link, seedLink, limiter, links, teacher } = setup()
    const raw = seedLink()

    expect(await rejectionOf(link(input(raw, 'qa-wrong-password')))).toMatchObject(INVALID_LINK)

    expect(calls).toContain(`limiter.reserve:${EMAIL}`)
    expect(limiter.state.failures).toBe(1)
    expect(links.rows).toHaveLength(1)
    expect(teacher.googleId).toBeNull()
    expect(calls).not.toContain('googleLinks.completeLink')
  })

  it('неизвестный токен и неверный пароль неотличимы', async () => {
    const unknown = setup()
    const wrong = setup()

    const errors = await Promise.all([
      rejectionOf(unknown.link(input(tokens.generateOpaqueToken()))),
      rejectionOf(wrong.link(input(wrong.seedLink(), 'qa-wrong-password'))),
    ])

    expect(new Set(errors.map((error) => JSON.stringify([(error as AppError).status, (error as AppError).message]))).size).toBe(1)
  })

  it('очередь хэширования заполнена — 503 до резерва, лимит не тратится', async () => {
    const { link, seedLink, hasher, limiter } = setup()
    const raw = seedLink()
    hasher.state.busy = true

    expect(await rejectionOf(link(input(raw)))).toBeInstanceOf(ServiceBusyError)
    expect(limiter.state.reservations).toBe(0)
  })

  it('очередь заполнилась во время сверки — 503, резерв снят', async () => {
    const { link, seedLink, hasher, limiter } = setup()
    const raw = seedLink()
    hasher.state.busyOnVerify = true

    expect(await rejectionOf(link(input(raw)))).toBeInstanceOf(ServiceBusyError)
    expect(limiter.state.failures).toBe(0)
  })

  it('лимит исчерпан — 429 без сверки пароля', async () => {
    const { link, seedLink, limiter } = setup()
    const raw = seedLink()
    limiter.state.blocked = true

    expect(await rejectionOf(link(input(raw)))).toBeInstanceOf(RateLimitedError)
    expect(calls).not.toContain('hasher.verify')
  })
})

describe('googleLink: успех', () => {
  it('верный пароль: резерв снят, Google привязан, запись удалена, сессия, шаги по порядку', async () => {
    const { link, seedLink, limiter, links, teacher, refresh } = setup()
    const raw = seedLink()

    const session = await link(input(raw))

    expect(limiter.state.failures).toBe(0)
    expect(teacher.googleId).toBe(GOOGLE_ID)
    expect(links.rows).toEqual([])
    expect(session.teacher).toMatchObject({ id: teacher.id, hasPassword: true, hasGoogle: true })
    expect(await tokens.verifyAccessToken(session.accessToken)).toEqual({ teacherId: teacher.id })
    expect(refresh.rows).toHaveLength(1)
    expect(calls).toEqual([
      'googleLinks.findByTokenHash',
      'hasher.assertCapacity',
      `limiter.reserve:${EMAIL}`,
      'hasher.verify',
      'limiter.release',
      'googleLinks.completeLink',
      'refreshTokens.createFamily',
    ])
  })

  it('completeLink получает то же now, по которому проверялся срок', async () => {
    const { link, seedLink, links } = setup()

    await link(input(seedLink()))

    expect(links.state.completedAt).toBe(NOW)
  })

  it('одно письмо о привязке учителю с его именем из базы, в фоне', async () => {
    const { link, seedLink, email } = setup()

    await link(input(seedLink()))
    await flushBackground()

    expect(email.sent).toEqual([{ kind: 'googleLinked', to: EMAIL, displayName: 'Анна Ли' }])
  })

  it('сбой письма не мешает привязке; в логе нет адреса', async () => {
    const logged: unknown[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args)
    })
    const { link, seedLink, teacher } = setup({ failEmail: new Error(`Resend rejected ${EMAIL}`) })

    await expect(link(input(seedLink()))).resolves.toMatchObject({ teacher: { id: teacher.id } })
    await flushBackground()

    expect(inspect(logged, { depth: null })).toContain('google.linked')
    expect(inspect(logged, { depth: null })).not.toContain(EMAIL)
  })

  it('токен одноразовый: повтор — тот же 400, второго письма нет', async () => {
    const { link, seedLink, email } = setup()
    const raw = seedLink()
    await link(input(raw))

    expect(await rejectionOf(link(input(raw)))).toMatchObject(INVALID_LINK)
    await flushBackground()
    expect(email.sent.filter((sent) => sent.kind === 'googleLinked')).toHaveLength(1)
  })
})

describe('googleLink: completeLink отказал', () => {
  it('этот Google-аккаунт уже у другого учителя — 409, ни сессии, ни письма', async () => {
    const other: TeacherAccount = {
      id: '0b9d8c7a-6f5e-4d3c-8b2a-1f0e9d8c7b6a',
      email: 'qa-boris@example.test',
      displayName: null,
      passwordHash: null,
      googleId: GOOGLE_ID,
      emailVerifiedAt: NOW,
    }
    const { link, seedLink, refresh, email, teacher } = setup({ others: [other] })

    const error = await rejectionOf(link(input(seedLink())))
    await flushBackground()

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject(LINK_CONFLICT)
    expect(refresh.rows).toEqual([])
    expect(email.sent).toEqual([])
    expect(teacher.googleId).toBeNull()
  })

  it('к учителю уже привязан другой Google — 409', async () => {
    const { link, seedLink, teacher } = setup()
    const raw = seedLink()
    teacher.googleId = 'google-sub-other'

    expect(await rejectionOf(link(input(raw)))).toMatchObject(LINK_CONFLICT)
  })

  it('ссылку заменили между поиском и подтверждением (completeLink → invalid) — 400 без письма', async () => {
    const { link, seedLink, links, email } = setup()
    const raw = seedLink()
    const original = links.repository.completeLink
    links.repository.completeLink = async (...args) => {
      links.rows.length = 0
      return original(...args)
    }

    expect(await rejectionOf(link(input(raw)))).toMatchObject(INVALID_LINK)
    await flushBackground()
    expect(email.sent).toEqual([])
  })
})
