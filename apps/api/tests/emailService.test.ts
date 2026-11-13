import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SUPPORTED_LOCALES } from '@nataskium/shared/locales'
import { registerSchema } from '@nataskium/shared/schemas'
import { RESET_PASSWORD_PATH, SIGN_IN_PATH, VERIFY_EMAIL_PATH, makeRegister, makeResendEmailSender, makeTokenService } from '../src/features/auth'
import { EMAIL_TEMPLATES } from '../src/features/auth/infrastructure/emailTemplates'
import { ExternalServiceError } from '../src/shared/errors'
import { flushBackground, makeFakeHasher, makeFakePendingRegistrations, makeFakeQuota, makeFakeTeachers } from './fakes/authFakes'

// fetch подменяется: настоящих писем и запросов к Resend нет
const RESEND_URL = 'https://api.resend.com/emails'
const API_KEY = 're_qa_fake_key_0123456789abcdef'
const FROM = 'noreply@nataskium.example'
const WEB_ORIGIN = 'https://nataskium.example'
const TO = 'qa-anna@example.test'
const TTL_HOURS = 24
const RESET_TTL_HOURS = 1
const EMAIL_TIMEOUT_MS = 8000
const EXPECTED_VERIFY_PATH = '/auth/verify-email'
const EXPECTED_SIGN_IN_PATH = '/auth/login'
const HOSTILE_NAME = `<img src=x onerror="alert('x')"> & Co`
const HTML_TAG = /<[a-z!/]/i

const tokens = makeTokenService({
  jwtSecret: 'qa-fake-jwt-secret-0123456789abcdef',
  hmacSecret: 'qa-fake-hmac-secret-0123456789abcdef',
})

type SentRequest = { url: string; init: RequestInit }
type ResendBody = { from: string; to: string[]; subject: string; html: string; text: string }

let requests: SentRequest[]
let respond: () => Promise<Response>

function okResponse() {
  return Promise.resolve(new Response(JSON.stringify({ id: 'qa-email-id' }), { status: 200 }))
}

function sender() {
  return makeResendEmailSender({
    apiKey: API_KEY,
    from: FROM,
    webOrigin: WEB_ORIGIN,
    verificationLinkTtlHours: TTL_HOURS,
    passwordResetLinkTtlHours: RESET_TTL_HOURS,
  })
}

function lastBody(): ResendBody {
  return JSON.parse(String(requests.at(-1)?.init.body)) as ResendBody
}

function linksIn(text: string): string[] {
  return text.match(/https?:\/\/[^\s"<]+/g) ?? []
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
  requests = []
  respond = okResponse
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    requests.push({ url, init })
    return respond()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Resend: запрос', () => {
  it('POST на api.resend.com с Bearer-ключом и JSON', async () => {
    await sender().sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'en')

    expect(requests).toHaveLength(1)
    const [{ url, init }] = requests as [SentRequest]
    expect(url).toBe(RESEND_URL)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal?.aborted).toBe(false)
  })

  it(`таймаут запроса — ${EMAIL_TIMEOUT_MS / 1000} секунд`, async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')

    await sender().sendAccountExistsEmail(TO, null, 'en')

    expect(timeout).toHaveBeenCalledWith(EMAIL_TIMEOUT_MS)
  })

  it('тело: отправитель с именем приложения, получатель массивом, тема, html и text', async () => {
    await sender().sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'en')

    const body = lastBody()
    expect(Object.keys(body).sort()).toEqual(['from', 'html', 'subject', 'text', 'to'])
    expect(body).toMatchObject({ from: `Nataskium <${FROM}>`, to: [TO], subject: 'Confirm your email — Nataskium' })
  })
})

describe('Resend: письмо подтверждения', () => {
  it('пути страниц фронтенда', () => {
    expect(VERIFY_EMAIL_PATH).toBe(EXPECTED_VERIFY_PATH)
    expect(SIGN_IN_PATH).toBe(EXPECTED_SIGN_IN_PATH)
  })

  it('ссылка ровно WEB_ORIGIN/auth/verify-email#token=<токен> в html и в text', async () => {
    const rawToken = tokens.generateOpaqueToken()

    await sender().sendVerificationEmail(TO, rawToken, 'en')

    const expected = `${WEB_ORIGIN}/en${EXPECTED_VERIFY_PATH}#token=${rawToken}`
    const { html, text } = lastBody()
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(linksIn(html)).toEqual([expected])
    expect(linksIn(text)).toEqual([expected])
  })

  // Фрагмент не уходит на сервер: токен не попадёт в логи Caddy, историю запросов и Referer
  it('токен только во фрагменте, не в query и не в пути', async () => {
    const rawToken = tokens.generateOpaqueToken()

    await sender().sendVerificationEmail(TO, rawToken, 'en')

    const { html, text } = lastBody()
    for (const link of [...linksIn(html), ...linksIn(text)]) {
      const url = new URL(link)
      expect(url.search).toBe('')
      expect(url.pathname).toBe(`/en${EXPECTED_VERIFY_PATH}`)
      expect(url.hash).toBe(`#token=${rawToken}`)
    }
    expect(html.split(rawToken)).toHaveLength(2)
    expect(text.split(rawToken)).toHaveLength(2)
  })

  it('обращение всегда «Hi,»: имя в письмо подтверждения не передаётся', async () => {
    await sender().sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'en')

    expect(lastBody().text.startsWith('Hi,')).toBe(true)
    expect(lastBody().html).toContain('<p>Hi,</p>')
  })

  // Имя из формы не подтверждено: кто угодно мог бы отправить чужому адресу письмо от Nataskium со своим текстом
  it('имя-фишинг из формы регистрации не попадает в письмо подтверждения', async () => {
    const calls: string[] = []
    const register = makeRegister({
      teachers: makeFakeTeachers(calls).teachers,
      pendingRegistrations: makeFakePendingRegistrations(calls).repository,
      hasher: makeFakeHasher(calls).hasher,
      tokens,
      emailSender: sender(),
      registrationEmailQuota: makeFakeQuota(calls).quota,
      now: () => new Date(),
    })

    await register(registerSchema.parse({ email: TO, password: 'qa-correct-horse-1957', displayName: 'Visit evil.example now' }))
    await flushBackground()

    expect(requests).toHaveLength(1)
    const { subject, html, text } = lastBody()
    for (const part of [subject, html, text]) {
      expect(part).not.toContain('evil.example')
      expect(part).not.toContain('Visit')
    }
  })

  it('срок ссылки в тексте письма', async () => {
    await sender().sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'en')

    expect(lastBody().text).toContain(`${TTL_HOURS} hours`)
    expect(lastBody().html).toContain(`${TTL_HOURS} hours`)
  })
})

describe('Resend: письмо «аккаунт уже есть»', () => {
  it('ссылка на вход, без токена; своя тема', async () => {
    await sender().sendAccountExistsEmail(TO, null, 'en')

    const { subject, html, text } = lastBody()
    expect(subject).toBe('You already have an account — Nataskium')
    expect(linksIn(html)).toEqual([`${WEB_ORIGIN}/en${EXPECTED_SIGN_IN_PATH}`])
    expect(linksIn(text)).toEqual([`${WEB_ORIGIN}/en${EXPECTED_SIGN_IN_PATH}`])
    expect(html).not.toContain('token')
  })
})

describe('Resend: письмо сброса пароля', () => {
  it('путь страницы сброса', () => {
    expect(RESET_PASSWORD_PATH).toBe('/auth/reset-password')
  })

  it('тема, ссылка ровно WEB_ORIGIN/auth/reset-password#token=<токен> в html и text, токен только во фрагменте', async () => {
    const rawToken = tokens.generateOpaqueToken()

    await sender().sendPasswordResetEmail(TO, rawToken, null, 'en')

    const expected = `${WEB_ORIGIN}/en/auth/reset-password#token=${rawToken}`
    const { subject, html, text, to } = lastBody()
    expect(subject).toBe('Reset your password — Nataskium')
    expect(to).toEqual([TO])
    expect(linksIn(html)).toEqual([expected])
    expect(linksIn(text)).toEqual([expected])
    for (const link of [...linksIn(html), ...linksIn(text)]) expect(new URL(link).search).toBe('')
    expect(html.split(rawToken)).toHaveLength(2)
  })

  it('текст: срок 1 час в единственном числе и «ссылка одноразовая»', async () => {
    await sender().sendPasswordResetEmail(TO, tokens.generateOpaqueToken(), null, 'en')

    for (const part of [lastBody().html, lastBody().text]) {
      expect(part).toContain('The link expires in 1 hour and works once.')
      expect(part).toContain('your password stays the same')
    }
  })

  it('срок больше часа — во множественном числе', async () => {
    const twoHours = makeResendEmailSender({
      apiKey: API_KEY,
      from: FROM,
      webOrigin: WEB_ORIGIN,
      verificationLinkTtlHours: TTL_HOURS,
      passwordResetLinkTtlHours: 2,
    })

    await twoHours.sendPasswordResetEmail(TO, tokens.generateOpaqueToken(), null, 'en')

    expect(lastBody().text).toContain('The link expires in 2 hours and works once.')
  })

  it('сбой отправки — ExternalServiceError, как у других писем', async () => {
    respond = () => Promise.resolve(new Response('{}', { status: 500 }))

    const error = await rejectionOf(sender().sendPasswordResetEmail(TO, tokens.generateOpaqueToken(), null, 'en'))

    expect(error).toBeInstanceOf(ExternalServiceError)
    expect(inspect(error, { depth: null })).not.toContain(API_KEY)
  })
})

describe('Resend: письмо «пароль изменён»', () => {
  it('тема, ссылки только на страницу входа, без токена', async () => {
    await sender().sendPasswordChangedEmail(TO, null, 'en')

    const { subject, html, text, to } = lastBody()
    expect(subject).toBe('Your password was changed — Nataskium')
    expect(to).toEqual([TO])
    for (const part of [html, text]) {
      const links = linksIn(part)
      expect(links.length).toBeGreaterThan(0)
      expect(new Set(links)).toEqual(new Set([`${WEB_ORIGIN}/en${EXPECTED_SIGN_IN_PATH}`]))
      expect(part).not.toMatch(/token/i)
    }
  })

  it('сообщает о выходе на всех устройствах и что делать, если это не учитель', async () => {
    await sender().sendPasswordChangedEmail(TO, null, 'en')

    for (const part of [lastBody().html, lastBody().text]) {
      expect(part).toContain('signed out on all devices')
      expect(part).toContain('Forgot password')
    }
  })

  it('сбой отправки — ExternalServiceError без ключа', async () => {
    respond = () => Promise.resolve(new Response('{}', { status: 500 }))

    const error = await rejectionOf(sender().sendPasswordChangedEmail(TO, null, 'en'))

    expect(error).toBeInstanceOf(ExternalServiceError)
    expect(inspect(error, { depth: null })).not.toContain(API_KEY)
  })
})

describe('Resend: письмо «вход через Google добавлен»', () => {
  it('тема, ссылки только на страницу входа, без токена', async () => {
    await sender().sendGoogleLinkedEmail(TO, null, 'en')

    const { subject, html, text, to } = lastBody()
    expect(subject).toBe('Google sign-in was added to your account — Nataskium')
    expect(to).toEqual([TO])
    for (const part of [html, text]) {
      expect(new Set(linksIn(part))).toEqual(new Set([`${WEB_ORIGIN}/en${EXPECTED_SIGN_IN_PATH}`]))
      expect(part).not.toMatch(/token/i)
    }
  })

  it('текст: что произошло и что делать, если это не учитель; в text нет HTML-тегов', async () => {
    await sender().sendGoogleLinkedEmail(TO, null, 'en')

    const { html, text } = lastBody()
    for (const part of [html, text]) {
      expect(part).toContain('Sign-in with Google was just added')
      expect(part).toContain('Forgot password')
    }
    expect(text).not.toMatch(HTML_TAG)
  })

  it('сбой отправки — ExternalServiceError без ключа', async () => {
    respond = () => Promise.resolve(new Response('{}', { status: 500 }))

    const error = await rejectionOf(sender().sendGoogleLinkedEmail(TO, null, 'en'))

    expect(error).toBeInstanceOf(ExternalServiceError)
    expect(inspect(error, { depth: null })).not.toContain(API_KEY)
  })
})

describe('Resend: имя учителя в письме', () => {
  // Имя есть в письмах «аккаунт уже есть» и сброса пароля: это имя существующего, подтверждённого учителя
  const SEND: [string, (name: string | null | undefined) => Promise<void>][] = [
    ['аккаунт уже есть', (name) => sender().sendAccountExistsEmail(TO, name, 'en')],
    ['сброс пароля', (name) => sender().sendPasswordResetEmail(TO, tokens.generateOpaqueToken(), name, 'en')],
    ['пароль изменён', (name) => sender().sendPasswordChangedEmail(TO, name, 'en')],
    ['Google привязан', (name) => sender().sendGoogleLinkedEmail(TO, name, 'en')],
  ]

  it.each(SEND)('%s: HTML-символы имени экранированы в html', async (_name, send) => {
    await send(HOSTILE_NAME)

    const { html } = lastBody()
    expect(html).toContain('Hi &lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; Co,')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror="')
  })

  it.each(SEND)('%s: в text имя как есть, HTML-тегов нет', async (_name, send) => {
    await send(HOSTILE_NAME)

    const { text } = lastBody()
    expect(text.startsWith(`Hi ${HOSTILE_NAME},`)).toBe(true)
    expect(text.replace(HOSTILE_NAME, '')).not.toMatch(HTML_TAG)
  })

  it.each(SEND)('%s: без имени — «Hi,»', async (_name, send) => {
    for (const name of [null, undefined]) {
      await send(name)

      expect(lastBody().text.startsWith('Hi,')).toBe(true)
      expect(lastBody().html).toContain('<p>Hi,</p>')
    }
  })

  it.each([
    ['&', '&amp;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['&lt; уже экранированный', '&amp;lt; уже экранированный'],
  ])('символ %j экранируется как %j', async (name, escaped) => {
    await sender().sendAccountExistsEmail(TO, name, 'en')

    expect(lastBody().html).toContain(`Hi ${escaped},`)
  })
})

describe('Resend: сбои', () => {
  // В ответе Resend об ошибке бывает адрес получателя
  function failingBody() {
    return JSON.stringify({ name: 'validation_error', message: `Invalid to: ${TO}` })
  }

  function expectSafeError(error: unknown, status: number | null) {
    expect(error).toBeInstanceOf(ExternalServiceError)
    expect(error).toMatchObject({ service: 'resend', status, message: 'resend request failed' })
    expect((error as Error).cause).toBeUndefined()
    const text = inspect(error, { depth: null })
    for (const secret of [API_KEY, TO, RESEND_URL, 'validation_error']) expect(text).not.toContain(secret)
  }

  // Иначе соединение keep-alive держалось бы до сборки мусора, а тело с адресом получателя оставалось бы в памяти
  it.each([500, 422])('HTTP %i — тело ответа не читается, поток отменяется', async (status) => {
    const stream = { cancelled: false, read: false }
    const body = new ReadableStream({
      pull(controller) {
        stream.read = true
        controller.enqueue(new TextEncoder().encode(failingBody()))
        controller.close()
      },
      cancel() {
        stream.cancelled = true
      },
    }, { highWaterMark: 0 })
    respond = () => Promise.resolve(new Response(body, { status }))

    expectSafeError(await rejectionOf(sender().sendAccountExistsEmail(TO, null, 'en')), status)
    expect(stream.cancelled).toBe(true)
    expect(stream.read).toBe(false)
  })

  it('HTTP 500 без тела — тоже ExternalServiceError', async () => {
    respond = () => Promise.resolve(new Response(null, { status: 500 }))

    expectSafeError(await rejectionOf(sender().sendAccountExistsEmail(TO, null, 'en')), 500)
  })

  it.each([400, 401, 403, 422, 429, 500, 503])('HTTP %i — ExternalServiceError со статусом, без тела ответа', async (status) => {
    respond = () => Promise.resolve(new Response(failingBody(), { status }))

    expectSafeError(await rejectionOf(sender().sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'en')), status)
  })

  // Статус проверяется отдельно от тела: прокси или сбой Resend могут вернуть ошибку с телом, похожим на успех
  it.each([500, 401])('HTTP %i с телом как у успеха — всё равно ExternalServiceError', async (status) => {
    respond = () => Promise.resolve(new Response(JSON.stringify({ id: 'qa-email-id' }), { status }))

    expectSafeError(await rejectionOf(sender().sendAccountExistsEmail(TO, null, 'en')), status)
  })

  it.each([
    ['не JSON', 'not json'],
    ['пустое тело', ''],
    ['без id', '{}'],
    ['id не строка', '{"id":42}'],
    ['массив', '[]'],
  ])('200, но ответ не прошёл Zod (%s) — ExternalServiceError', async (_name, body) => {
    respond = () => Promise.resolve(new Response(body, { status: 200 }))

    expectSafeError(await rejectionOf(sender().sendAccountExistsEmail(TO, null, 'en')), 200)
  })

  it.each([
    ['сбой сети', () => Promise.reject(new TypeError(`fetch failed: ${RESEND_URL} Bearer ${API_KEY} to ${TO}`))],
    ['таймаут', () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))],
    ['синхронный throw', () => {
      throw new Error(`boom ${API_KEY}`)
    }],
  ])('%s — ExternalServiceError без статуса и без исходной ошибки', async (_name, failure) => {
    respond = failure as () => Promise<Response>

    expectSafeError(await rejectionOf(sender().sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'en')), null)
  })

  it('настоящий таймаут: зависший запрос прерывается AbortSignal', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), 10)
      return controller.signal
    })
    respond = () =>
      new Promise((_resolve, reject) => {
        const signal = requests.at(-1)?.init.signal
        signal?.addEventListener('abort', () => reject(signal.reason))
      })

    expectSafeError(await rejectionOf(sender().sendAccountExistsEmail(TO, null, 'en')), null)
  })
})

describe('язык письма: русский и английский', () => {
  const CYRILLIC = /[А-Яа-яЁё]/
  const SENDS = {
    verification: () => sender().sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'ru'),
    accountExists: () => sender().sendAccountExistsEmail(TO, null, 'ru'),
    passwordReset: () => sender().sendPasswordResetEmail(TO, tokens.generateOpaqueToken(), null, 'ru'),
    passwordChanged: () => sender().sendPasswordChangedEmail(TO, null, 'ru'),
    googleLinked: () => sender().sendGoogleLinkedEmail(TO, null, 'ru'),
  }

  it('шаблоны есть для каждого поддерживаемого языка', () => {
    expect(Object.keys(EMAIL_TEMPLATES).sort()).toEqual([...SUPPORTED_LOCALES].sort())
  })

  it.each(Object.entries(SENDS))('%s на русском: тема, html и text по-русски, без «undefined»', async (_name, send) => {
    await send()

    const { subject, html, text } = lastBody()
    for (const part of [subject, html, text]) {
      expect(part).toMatch(CYRILLIC)
      expect(part).not.toContain('undefined')
    }
  })

  it('на английском в письмах нет кириллицы', async () => {
    const english = [
      () => sender().sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'en'),
      () => sender().sendAccountExistsEmail(TO, null, 'en'),
      () => sender().sendPasswordResetEmail(TO, tokens.generateOpaqueToken(), null, 'en'),
      () => sender().sendPasswordChangedEmail(TO, null, 'en'),
      () => sender().sendGoogleLinkedEmail(TO, null, 'en'),
    ]
    for (const send of english) {
      await send()
      const { subject, html, text } = lastBody()
      expect(`${subject}${html}${text}`).not.toMatch(CYRILLIC)
    }
  })

  it('русское письмо подтверждения ведёт на страницу без префикса, английское — с /en', async () => {
    const rawToken = tokens.generateOpaqueToken()

    await sender().sendVerificationEmail(TO, rawToken, 'ru')
    const russian = lastBody()
    await sender().sendVerificationEmail(TO, rawToken, 'en')
    const english = lastBody()

    expect(linksIn(russian.text)).toEqual([`${WEB_ORIGIN}${EXPECTED_VERIFY_PATH}#token=${rawToken}`])
    expect(linksIn(english.text)).toEqual([`${WEB_ORIGIN}/en${EXPECTED_VERIFY_PATH}#token=${rawToken}`])
  })

  it('русское письмо сброса: ссылка без префикса, токен только во фрагменте', async () => {
    const rawToken = tokens.generateOpaqueToken()

    await sender().sendPasswordResetEmail(TO, rawToken, null, 'ru')

    const { html, text } = lastBody()
    for (const part of [html, text]) {
      expect(linksIn(part)).toEqual([`${WEB_ORIGIN}/auth/reset-password#token=${rawToken}`])
    }
  })

  it.each([
    [`пароль изменён`, () => sender().sendPasswordChangedEmail(TO, null, 'ru')],
    [`Google привязан`, () => sender().sendGoogleLinkedEmail(TO, null, 'ru')],
    [`аккаунт уже есть`, () => sender().sendAccountExistsEmail(TO, null, 'ru')],
  ])('русское письмо «%s»: ссылки только на страницу входа без префикса', async (_name, send) => {
    await send()

    const { html, text } = lastBody()
    for (const part of [html, text]) {
      expect(new Set(linksIn(part))).toEqual(new Set([`${WEB_ORIGIN}${EXPECTED_SIGN_IN_PATH}`]))
    }
  })

  it.each([
    [1, '1 час'],
    [2, '2 часа'],
    [4, '4 часа'],
    [5, '5 часов'],
    [11, '11 часов'],
    [21, '21 час'],
    [24, '24 часа'],
  ])('срок ссылки %i ч в русском письме: «%s»', async (hours, expected) => {
    const custom = makeResendEmailSender({
      apiKey: API_KEY,
      from: FROM,
      webOrigin: WEB_ORIGIN,
      verificationLinkTtlHours: hours,
      passwordResetLinkTtlHours: hours,
    })

    await custom.sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'ru')
    expect(lastBody().text).toContain(`Ссылка действует ${expected}.`)
    await custom.sendPasswordResetEmail(TO, tokens.generateOpaqueToken(), null, 'ru')
    expect(lastBody().text).toContain(`Ссылка действует ${expected} и срабатывает один раз.`)
  })

  it('имя в русском письме экранируется для HTML, в text — как есть', async () => {
    await sender().sendPasswordChangedEmail(TO, HOSTILE_NAME, 'ru')

    const { html, text } = lastBody()
    expect(html).not.toMatch(/<img/i)
    expect(html).toContain('Здравствуйте, &lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; Co!')
    expect(text).toContain(`Здравствуйте, ${HOSTILE_NAME}!`)
  })
})

describe('язык письма: немецкий и французский', () => {
  const CYRILLIC = /[А-Яа-яЁё]/
  const NEW_LOCALES = ['de', 'fr'] as const

  function allSends(locale: (typeof NEW_LOCALES)[number]): (() => Promise<void>)[] {
    return [
      () => sender().sendVerificationEmail(TO, tokens.generateOpaqueToken(), locale),
      () => sender().sendAccountExistsEmail(TO, null, locale),
      () => sender().sendPasswordResetEmail(TO, tokens.generateOpaqueToken(), null, locale),
      () => sender().sendPasswordChangedEmail(TO, null, locale),
      () => sender().sendGoogleLinkedEmail(TO, null, locale),
    ]
  }

  it.each(NEW_LOCALES)('%s: все письма без кириллицы и без «undefined»', async (locale) => {
    for (const send of allSends(locale)) {
      await send()
      const { subject, html, text } = lastBody()
      for (const part of [subject, html, text]) {
        expect(part).not.toMatch(CYRILLIC)
        expect(part).not.toContain('undefined')
      }
    }
  })

  it('немецкое письмо подтверждения: тема и ссылка с префиксом /de', async () => {
    const rawToken = tokens.generateOpaqueToken()

    await sender().sendVerificationEmail(TO, rawToken, 'de')

    const { subject, html, text } = lastBody()
    expect(subject).toBe('Bestätigen Sie Ihre E-Mail-Adresse — Nataskium')
    expect(text.startsWith('Hallo,')).toBe(true)
    expect(linksIn(html)).toEqual([`${WEB_ORIGIN}/de${EXPECTED_VERIFY_PATH}#token=${rawToken}`])
    expect(linksIn(text)).toEqual([`${WEB_ORIGIN}/de${EXPECTED_VERIFY_PATH}#token=${rawToken}`])
  })

  it('французское письмо подтверждения: тема и ссылка с префиксом /fr', async () => {
    const rawToken = tokens.generateOpaqueToken()

    await sender().sendVerificationEmail(TO, rawToken, 'fr')

    const { subject, html, text } = lastBody()
    expect(subject).toBe('Confirmez votre adresse e-mail — Nataskium')
    expect(text.startsWith('Bonjour,')).toBe(true)
    expect(linksIn(html)).toEqual([`${WEB_ORIGIN}/fr${EXPECTED_VERIFY_PATH}#token=${rawToken}`])
    expect(linksIn(text)).toEqual([`${WEB_ORIGIN}/fr${EXPECTED_VERIFY_PATH}#token=${rawToken}`])
  })

  it.each(NEW_LOCALES)('%s: письма «аккаунт уже есть» и «пароль изменён» ведут на страницу входа с префиксом языка', async (locale) => {
    const expected = new Set([`${WEB_ORIGIN}/${locale}${EXPECTED_SIGN_IN_PATH}`])

    await sender().sendAccountExistsEmail(TO, null, locale)
    expect(new Set(linksIn(lastBody().html))).toEqual(expected)
    await sender().sendPasswordChangedEmail(TO, null, locale)
    expect(new Set(linksIn(lastBody().text))).toEqual(expected)
  })

  it.each(NEW_LOCALES)('%s: ссылка сброса пароля с префиксом языка, токен только во фрагменте', async (locale) => {
    const rawToken = tokens.generateOpaqueToken()

    await sender().sendPasswordResetEmail(TO, rawToken, null, locale)

    const { html, text } = lastBody()
    for (const part of [html, text]) {
      expect(linksIn(part)).toEqual([`${WEB_ORIGIN}/${locale}/auth/reset-password#token=${rawToken}`])
    }
  })

  it('немецкий срок: 1 Stunde и несколько Stunden', async () => {
    const hourly = (hours: number) => makeResendEmailSender({
      apiKey: API_KEY,
      from: FROM,
      webOrigin: WEB_ORIGIN,
      verificationLinkTtlHours: hours,
      passwordResetLinkTtlHours: hours,
    })

    await hourly(1).sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'de')
    expect(lastBody().text).toContain('Der Link ist 1 Stunde gültig.')
    await hourly(24).sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'de')
    expect(lastBody().text).toContain('Der Link ist 24 Stunden gültig.')
    await hourly(1).sendPasswordResetEmail(TO, tokens.generateOpaqueToken(), null, 'de')
    expect(lastBody().text).toContain('Der Link ist 1 Stunde gültig und funktioniert nur einmal.')
  })

  it('французский срок: 0 и 1 — единственное число, больше — множественное', async () => {
    const hourly = (hours: number) => makeResendEmailSender({
      apiKey: API_KEY,
      from: FROM,
      webOrigin: WEB_ORIGIN,
      verificationLinkTtlHours: hours,
      passwordResetLinkTtlHours: hours,
    })

    await hourly(1).sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'fr')
    expect(lastBody().text).toContain('Le lien est valable 1 heure.')
    await hourly(2).sendVerificationEmail(TO, tokens.generateOpaqueToken(), 'fr')
    expect(lastBody().text).toContain('Le lien est valable 2 heures.')
    await hourly(24).sendPasswordResetEmail(TO, tokens.generateOpaqueToken(), null, 'fr')
    expect(lastBody().text).toContain('Le lien est valable 24 heures et ne fonctionne qu\'une seule fois.')
  })
})

describe('письмо «аккаунт удалён»', () => {
  const LOCALES = ['ru', 'en', 'de', 'fr'] as const
  const CYRILLIC = /[А-Яа-яЁё]/

  it.each(LOCALES)('%s: отправляется на адрес учителя, без ссылок и токенов', async (locale) => {
    await sender().sendAccountDeletedEmail(TO, null, locale)

    const { subject, html, text, to } = lastBody()
    expect(to).toEqual([TO])
    expect(subject).toContain('Nataskium')
    for (const part of [subject, html, text]) expect(part).not.toContain('undefined')
    expect(linksIn(html)).toEqual([])
    expect(linksIn(text)).toEqual([])
    expect(html).not.toMatch(/token/i)
    expect(text).not.toMatch(/token/i)
  })

  it.each(LOCALES)('%s: имя экранируется в html и не попадает в ссылки', async (locale) => {
    await sender().sendAccountDeletedEmail(TO, HOSTILE_NAME, locale)

    const { html, text } = lastBody()
    expect(html).not.toMatch(/<img/i)
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; Co')
    expect(text).toContain(HOSTILE_NAME)
    expect(text.replace(HOSTILE_NAME, '')).not.toMatch(HTML_TAG)
  })

  it('русское письмо — по-русски, английское — без кириллицы', async () => {
    await sender().sendAccountDeletedEmail(TO, null, 'ru')
    expect(lastBody().subject).toBe('Аккаунт удалён — Nataskium')
    expect(lastBody().text).toMatch(CYRILLIC)

    await sender().sendAccountDeletedEmail(TO, null, 'en')
    expect(`${lastBody().subject}${lastBody().html}${lastBody().text}`).not.toMatch(CYRILLIC)
  })

  it('без имени — приветствие по умолчанию', async () => {
    await sender().sendAccountDeletedEmail(TO, null, 'en')

    expect(lastBody().text.startsWith('Hi,')).toBe(true)
    expect(lastBody().html).toContain('<p>Hi,</p>')
  })
})
