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

function requiredMessage(problem: string) {
  return (issue: { input: unknown }) => (issue.input === undefined ? 'is required' : problem)
}

// Байты, а не символы: секрет из 16 кириллических букв — это 32 байта
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

export type Env = z.infer<typeof envSchema>

// В сообщении только имена переменных и причины: значения могут оказаться секретами
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (result.success) return result.data

  const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
  throw new Error(`Invalid environment variables:\n${problems.join('\n')}`)
}
