import { BlockList, isIPv4 } from 'node:net'
import { z } from 'zod'

const DEFAULT_API_PORT = 3001
const MIN_PORT = 1
const MAX_PORT = 65535
const PORT_ERROR = `must be an integer from ${MIN_PORT} to ${MAX_PORT}`
const DATABASE_URL_PROTOCOL = /^postgres(ql)?$/
const MIN_SECRET_BYTES = 32
const WEB_ORIGIN_PROTOCOL = /^https?$/
const HTTPS_PREFIX = 'https://'
const LIST_SEPARATOR = ','
// Тестовый домен Resend: письма с него уходят только на адрес владельца аккаунта Resend
const RESEND_TEST_DOMAIN = 'resend.dev'
// Формат ключей Resend: префикс re_ и случайная часть; короче — почти наверняка обрезанный или чужой ключ
const RESEND_API_KEY_PREFIX = 're_'
const MIN_RESEND_API_KEY_LENGTH = 20
// Callback Google OAuth — маршрут API под тем же origin, что и фронтенд (Caddy не срезает /api)
const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback'
// Правила имён бакетов S3: 3–63 символа, строчные буквы, цифры, точки и дефисы, по краям — буква или цифра
const S3_BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
const TRAILING_SLASH = '/'
const CIDR_SEPARATOR = '/'
const MIN_IPV4_PREFIX = 16
const MIN_IPV6_PREFIX = 64
// IPv4 в виде IPv6: BlockList сопоставляет с этим блоком и обычные IPv4-адреса
const IPV4_MAPPED_NETWORK = '::ffff:0:0'
const IPV4_MAPPED_PREFIX = 96
const MIN_IPV4_MAPPED_PREFIX = IPV4_MAPPED_PREFIX + MIN_IPV4_PREFIX
// Устаревший IPv4-compatible блок (RFC 4291): диапазоны в нём не нужны, отдельные адреса вроде ::1 допустимы
const IPV4_COMPATIBLE_NETWORK = '::'
const IPV4_COMPATIBLE_PREFIX = 96
const IPV6_HOST_PREFIX = 128

// Пустая строка (как в .env.example) — то же, что «не задано»
function emptyAsUndefined(value: unknown): unknown {
  return value === '' ? undefined : value
}

function isOnResendTestDomain(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
  return domain === RESEND_TEST_DOMAIN || domain.endsWith(`.${RESEND_TEST_DOMAIN}`)
}

type GoogleSettings = { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GOOGLE_REDIRECT_URI?: string }

function isGoogleConfigured(env: GoogleSettings): boolean {
  return env.GOOGLE_CLIENT_ID !== undefined && env.GOOGLE_CLIENT_SECRET !== undefined && env.GOOGLE_REDIRECT_URI !== undefined
}

function isGoogleUnset(env: GoogleSettings): boolean {
  return env.GOOGLE_CLIENT_ID === undefined && env.GOOGLE_CLIENT_SECRET === undefined && env.GOOGLE_REDIRECT_URI === undefined
}

type ImageStorageSettings = {
  YANDEX_S3_ENDPOINT?: string
  YANDEX_S3_BUCKET?: string
  YANDEX_S3_ACCESS_KEY?: string
  YANDEX_S3_SECRET_KEY?: string
  IMAGES_PUBLIC_BASE_URL?: string
}

function imageStorageValues(env: ImageStorageSettings) {
  return [env.YANDEX_S3_ENDPOINT, env.YANDEX_S3_BUCKET, env.YANDEX_S3_ACCESS_KEY, env.YANDEX_S3_SECRET_KEY, env.IMAGES_PUBLIC_BASE_URL]
}

function isImageStorageConfigured(env: ImageStorageSettings): boolean {
  return imageStorageValues(env).every((value) => value !== undefined)
}

function isImageStorageUnset(env: ImageStorageSettings): boolean {
  return imageStorageValues(env).every((value) => value === undefined)
}

const IMAGE_STORAGE_NAMES = 'YANDEX_S3_ENDPOINT, YANDEX_S3_BUCKET, YANDEX_S3_ACCESS_KEY, YANDEX_S3_SECRET_KEY and IMAGES_PUBLIC_BASE_URL'

// Публичный адрес картинки — база + '/' + ключ: без слэша в конце, query, якоря и логина в адресе
function isPublicBaseUrl(url: string): boolean {
  const parsed = new URL(url)
  if (url.endsWith(TRAILING_SLASH)) return false
  return parsed.search === '' && parsed.hash === '' && parsed.username === '' && parsed.password === ''
}

function requiredMessage(problem: string) {
  return (issue: { input: unknown }) => (issue.input === undefined ? 'is required' : problem)
}

// Байты, а не символы: секрет из 16 кириллических букв — это 32 байта
const trimmedOptionalSchema = z.preprocess(
  emptyAsUndefined,
  z
    .string()
    .refine((value) => value === value.trim(), { error: 'must not start or end with whitespace' })
    .optional(),
)

const secretSchema = z
  .string({ error: 'is required' })
  .refine((secret) => Buffer.byteLength(secret, 'utf8') >= MIN_SECRET_BYTES, {
    error: `must be at least ${MIN_SECRET_BYTES} bytes`,
  })
  // Пробельный символ по краю (как \s в JS, включая NBSP и BOM) — обычно след копирования, а не часть секрета
  .refine((secret) => secret === secret.trim(), { error: 'must not start or end with whitespace' })

type Cidr = { network: string; prefix: number }

function parseCidr(entry: string): Cidr | null {
  const [network = '', prefixText] = entry.split(CIDR_SEPARATOR)
  return prefixText === undefined ? null : { network, prefix: Number(prefixText) }
}

// Две IPv6-сети пересекаются, если более широкая содержит начало более узкой
function overlaps(range: Cidr, block: Cidr): boolean {
  const [wide, narrow] = range.prefix <= block.prefix ? [range, block] : [block, range]
  const list = new BlockList()
  list.addSubnet(wide.network, wide.prefix, 'ipv6')
  return list.check(narrow.network, 'ipv6')
}

const IPV4_MAPPED_BLOCK: Cidr = { network: IPV4_MAPPED_NETWORK, prefix: IPV4_MAPPED_PREFIX }
const IPV4_COMPATIBLE_BLOCK: Cidr = { network: IPV4_COMPATIBLE_NETWORK, prefix: IPV4_COMPATIBLE_PREFIX }

// Слишком широкая сеть (вплоть до 0.0.0.0/0 и ::/0) значила бы «верить X-Real-IP от всех»
function isNarrowRange(entry: string): boolean {
  const range = parseCidr(entry)
  if (range === null) return true
  if (isIPv4(range.network)) return range.prefix >= MIN_IPV4_PREFIX

  const minPrefix = overlaps(range, IPV4_MAPPED_BLOCK) ? MIN_IPV4_MAPPED_PREFIX : MIN_IPV6_PREFIX
  return range.prefix >= minPrefix
}

function isOutsideIpv4Compatible(entry: string): boolean {
  const range = parseCidr(entry)
  if (range === null || isIPv4(range.network) || range.prefix === IPV6_HOST_PREFIX) return true
  return !overlaps(range, IPV4_COMPATIBLE_BLOCK)
}

// Следующая проверка — только если предыдущие прошли: иначе к первой ошибке добавилась бы вторая
const onlyIfValid = { when: (payload: { issues: readonly unknown[] }) => payload.issues.length === 0 }

const trustedProxySchema = z
  .union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()], {
    error: 'must be a comma-separated list of IP addresses or CIDR ranges',
  })
  .refine(isNarrowRange, {
    error: `CIDR range is too wide: at least /${MIN_IPV4_PREFIX} for IPv4, /${MIN_IPV6_PREFIX} for IPv6, /${MIN_IPV4_MAPPED_PREFIX} within ${IPV4_MAPPED_NETWORK}/${IPV4_MAPPED_PREFIX}`,
    ...onlyIfValid,
  })
  .refine(isOutsideIpv4Compatible, {
    error: `CIDR ranges within deprecated ${IPV4_COMPATIBLE_NETWORK}/${IPV4_COMPATIBLE_PREFIX} are not allowed`,
    ...onlyIfValid,
  })

const envFieldsSchema = z.object({
  // production по умолчанию: вне разработки стек ошибок в лог не пишется
  NODE_ENV: z
    .enum(['development', 'production', 'test'], { error: 'must be one of: development, production, test' })
    .default('production'),
  // Только цифры: z.coerce.number() пропустил бы '', ' 3002 ', '1e3' и '0x10'
  API_PORT: z
    .string()
    .regex(/^\d+$/, { error: PORT_ERROR })
    .transform(Number)
    .pipe(z.number().min(MIN_PORT, { error: PORT_ERROR }).max(MAX_PORT, { error: PORT_ERROR }))
    .default(DEFAULT_API_PORT),
  DATABASE_URL: z.url({
    protocol: DATABASE_URL_PROTOCOL,
    // Без проверки хоста прошли бы 'postgresql:' и 'postgresql:///db'
    hostname: /.+/,
    error: requiredMessage('must be a postgresql:// or postgres:// URL'),
  }),
  JWT_SECRET: secretSchema,
  HMAC_SECRET: secretSchema,
  // Ровно origin: с ним сравниваются CORS и заголовок Origin, от него строятся ссылки в письмах
  WEB_ORIGIN: z
    .url({
      protocol: WEB_ORIGIN_PROTOCOL,
      hostname: /.+/,
      // Без abort проверка origin ниже получила бы строку, которую new URL не разберёт
      abort: true,
      error: requiredMessage('must be an http:// or https:// URL'),
    })
    .refine((url) => new URL(url).origin === url, {
      error: 'must be an origin: lowercase, without path, query or trailing slash',
    }),
  // Адреса Caddy: только от них принимается X-Real-IP
  TRUSTED_PROXY_IPS: z
    .string()
    .default('')
    .transform((list) =>
      list
        .split(LIST_SEPARATOR)
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    )
    .pipe(z.array(trustedProxySchema)),
  // Почта (Resend). Вне production необязательна: без неё письма не уходят, а в лог пишется только тип ошибки
  RESEND_API_KEY: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .refine((key) => key === key.trim(), { error: 'must not start or end with whitespace', abort: true })
      .refine((key) => key.startsWith(RESEND_API_KEY_PREFIX) && key.length >= MIN_RESEND_API_KEY_LENGTH, {
        error: `must start with ${RESEND_API_KEY_PREFIX} and be at least ${MIN_RESEND_API_KEY_LENGTH} characters`,
      })
      .optional(),
  ),
  EMAIL_FROM: z.preprocess(emptyAsUndefined, z.email({ error: 'must be an email address' }).optional()),
  // Вход через Google. Вне production необязателен: без него маршруты /api/auth/google/* не подключаются
  GOOGLE_CLIENT_ID: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .refine((id) => id === id.trim(), { error: 'must not start or end with whitespace' })
      .optional(),
  ),
  GOOGLE_CLIENT_SECRET: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .refine((secret) => secret === secret.trim(), { error: 'must not start or end with whitespace' })
      .optional(),
  ),
  GOOGLE_REDIRECT_URI: z.preprocess(
    emptyAsUndefined,
    z.url({ protocol: WEB_ORIGIN_PROTOCOL, hostname: /.+/, error: 'must be an http:// or https:// URL' }).optional(),
  ),
  // Хранилище картинок (Яндекс Object Storage). Вне production необязательно: без него загрузка картинок отвечает 503
  YANDEX_S3_ENDPOINT: z.preprocess(
    emptyAsUndefined,
    z
      .url({ protocol: WEB_ORIGIN_PROTOCOL, hostname: /.+/, abort: true, error: 'must be an http:// or https:// origin without path' })
      .refine((url) => new URL(url).origin === url, { error: 'must be an http:// or https:// origin without path' })
      .optional(),
  ),
  YANDEX_S3_BUCKET: z.preprocess(
    emptyAsUndefined,
    z.string().regex(S3_BUCKET_NAME, { error: 'must be a valid bucket name' }).optional(),
  ),
  YANDEX_S3_ACCESS_KEY: trimmedOptionalSchema,
  YANDEX_S3_SECRET_KEY: trimmedOptionalSchema,
  IMAGES_PUBLIC_BASE_URL: z.preprocess(
    emptyAsUndefined,
    z
      .url({
        protocol: WEB_ORIGIN_PROTOCOL,
        hostname: /.+/,
        abort: true,
        error: 'must be an http:// or https:// URL without trailing slash, query or credentials',
      })
      .refine(isPublicBaseUrl, { error: 'must be an http:// or https:// URL without trailing slash, query or credentials' })
      .optional(),
  ),
  // Сверка хранилища с базой удаляет файлы без строки в quiz_images. Включать только там, где бакет принадлежит
  // ТОЛЬКО этой базе: dev с прод-бакетом или пустая база иначе удалили бы чужие файлы.
  // undefined — не задано: в production это ошибка, вне production — false (в конце envSchema)
  IMAGE_STORAGE_RECONCILE: z
    .preprocess(emptyAsUndefined, z.enum(['true', 'false'], { error: "must be 'true' or 'false'" }).optional())
    .transform((value) => (value === undefined ? undefined : value === 'true')),
})

// Проверки между полями — только когда сами поля верны (onlyIfValid), иначе к ошибке поля добавилась бы вторая
const envSchema = envFieldsSchema
  .refine((env) => env.HMAC_SECRET !== env.JWT_SECRET, {
    path: ['HMAC_SECRET'],
    error: 'must differ from JWT_SECRET',
    ...onlyIfValid,
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.WEB_ORIGIN.startsWith(HTTPS_PREFIX), {
    path: ['WEB_ORIGIN'],
    error: 'must use https:// in production',
    ...onlyIfValid,
  })
  // https-адрес при dev-режиме — признак ошибки деплоя: на сервере потерялся NODE_ENV
  .refine((env) => env.NODE_ENV === 'production' || !env.WEB_ORIGIN.startsWith(HTTPS_PREFIX), {
    path: ['WEB_ORIGIN'],
    error: 'must not use https:// outside production',
    ...onlyIfValid,
  })
  // Без списка за Caddy все запросы получат один ключ rate limit — адрес самого Caddy
  .refine((env) => env.NODE_ENV !== 'production' || env.TRUSTED_PROXY_IPS.length > 0, {
    path: ['TRUSTED_PROXY_IPS'],
    error: 'is required in production',
    ...onlyIfValid,
  })
  // Без почты учитель не подтвердит регистрацию: в production сервер без неё не стартует
  .refine((env) => env.NODE_ENV !== 'production' || env.RESEND_API_KEY !== undefined, {
    path: ['RESEND_API_KEY'],
    error: 'is required in production',
    ...onlyIfValid,
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.EMAIL_FROM !== undefined, {
    path: ['EMAIL_FROM'],
    error: 'is required in production',
    ...onlyIfValid,
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.EMAIL_FROM === undefined || !isOnResendTestDomain(env.EMAIL_FROM), {
    path: ['EMAIL_FROM'],
    error: `must not use the ${RESEND_TEST_DOMAIN} test domain in production`,
    ...onlyIfValid,
  })
  // Половина настройки — почти наверняка ошибка: письма молча не уходили бы
  .refine((env) => (env.RESEND_API_KEY === undefined) === (env.EMAIL_FROM === undefined), {
    path: ['EMAIL_FROM'],
    error: 'RESEND_API_KEY and EMAIL_FROM must be set together',
    ...onlyIfValid,
  })
  .refine((env) => env.NODE_ENV !== 'production' || isGoogleConfigured(env), {
    path: ['GOOGLE_CLIENT_ID'],
    error: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI are required in production',
    ...onlyIfValid,
  })
  .refine((env) => isGoogleConfigured(env) || isGoogleUnset(env), {
    path: ['GOOGLE_CLIENT_ID'],
    error: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI must be set together',
    ...onlyIfValid,
  })
  // Иначе Google вернёт учителя не на наш callback, и cookie __Secure-oauth (Path=/api/auth/google) не придёт
  .refine((env) => env.GOOGLE_REDIRECT_URI === undefined || env.GOOGLE_REDIRECT_URI === `${env.WEB_ORIGIN}${GOOGLE_CALLBACK_PATH}`, {
    path: ['GOOGLE_REDIRECT_URI'],
    error: `must be WEB_ORIGIN + ${GOOGLE_CALLBACK_PATH}`,
    ...onlyIfValid,
  })

  // Ключи S3 уходят на endpoint с каждым запросом, картинки показываются на https-странице
  .refine((env) => env.NODE_ENV !== 'production' || env.YANDEX_S3_ENDPOINT === undefined || env.YANDEX_S3_ENDPOINT.startsWith(HTTPS_PREFIX), {
    path: ['YANDEX_S3_ENDPOINT'],
    error: 'must use https:// in production',
    ...onlyIfValid,
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.IMAGES_PUBLIC_BASE_URL === undefined || env.IMAGES_PUBLIC_BASE_URL.startsWith(HTTPS_PREFIX), {
    path: ['IMAGES_PUBLIC_BASE_URL'],
    error: 'must use https:// in production',
    ...onlyIfValid,
  })
  .refine((env) => env.NODE_ENV !== 'production' || isImageStorageConfigured(env), {
    path: ['YANDEX_S3_ENDPOINT'],
    error: `${IMAGE_STORAGE_NAMES} are required in production`,
    ...onlyIfValid,
  })
  .refine((env) => isImageStorageConfigured(env) || isImageStorageUnset(env), {
    path: ['YANDEX_S3_ENDPOINT'],
    error: `${IMAGE_STORAGE_NAMES} must be set together`,
    ...onlyIfValid,
  })
  // Решение о сверке в production — только явное: молчаливое false оставляло бы файлы удалённых аккаунтов без страховки
  .refine((env) => env.NODE_ENV !== 'production' || env.IMAGE_STORAGE_RECONCILE !== undefined, {
    path: ['IMAGE_STORAGE_RECONCILE'],
    error: 'is required in production',
    ...onlyIfValid,
  })
  .transform((env) => ({ ...env, IMAGE_STORAGE_RECONCILE: env.IMAGE_STORAGE_RECONCILE ?? false }))

export type Env = z.infer<typeof envSchema>

// В сообщении только имена переменных и причины: значения могут оказаться секретами
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (result.success) return result.data

  const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
  throw new Error(`Invalid environment variables:\n${problems.join('\n')}`)
}
