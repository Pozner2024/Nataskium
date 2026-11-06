import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/shared/config'

// Выдуманный адрес: настоящий пароль из .env в тестах не используется
const TEST_DATABASE_URL = 'postgresql://qa_user:qa-fake-password@db.example.test:5432/qa_db'
const MIN_SECRET_BYTES = 32
// Выдуманные секреты для тестов, длиннее минимума
const TEST_JWT_SECRET = 'qa-fake-jwt-secret-0123456789abcdef'
const TEST_HMAC_SECRET = 'qa-fake-hmac-secret-0123456789abcdef'
const PROD_ORIGIN = 'https://nataskium.example'
const DEV_ORIGIN = 'http://localhost:3000'
const TEST_PROXY_IP = '172.18.0.2'
// Выдуманный ключ Resend: настоящий ключ в тестах не используется, письма не отправляются
const TEST_RESEND_KEY = 're_qa_fake_key_0123456789abcdef'
const TEST_EMAIL_FROM = 'noreply@nataskium.example'
// Полное окружение production: NODE_ENV по умолчанию — production
const VALID = {
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: TEST_JWT_SECRET,
  HMAC_SECRET: TEST_HMAC_SECRET,
  WEB_ORIGIN: PROD_ORIGIN,
  TRUSTED_PROXY_IPS: TEST_PROXY_IP,
  RESEND_API_KEY: TEST_RESEND_KEY,
  EMAIL_FROM: TEST_EMAIL_FROM,
}
// Для development и test: http-адрес, без списка прокси
// Вне production почта необязательна: локально её обычно нет
const VALID_LOCAL = { ...VALID, WEB_ORIGIN: DEV_ORIGIN, TRUSTED_PROXY_IPS: undefined, RESEND_API_KEY: undefined, EMAIL_FROM: undefined }
const DEFAULT_ENV = {
  NODE_ENV: 'production',
  API_PORT: 3001,
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: TEST_JWT_SECRET,
  HMAC_SECRET: TEST_HMAC_SECRET,
  WEB_ORIGIN: PROD_ORIGIN,
  TRUSTED_PROXY_IPS: [TEST_PROXY_IP],
  RESEND_API_KEY: TEST_RESEND_KEY,
  EMAIL_FROM: TEST_EMAIL_FROM,
}
const DATABASE_URL_REQUIRED = '  DATABASE_URL: is required'
const DATABASE_URL_PROBLEM = '  DATABASE_URL: must be a postgresql:// or postgres:// URL'
const JWT_SECRET_REQUIRED = '  JWT_SECRET: is required'
const HMAC_SECRET_REQUIRED = '  HMAC_SECRET: is required'
const WEB_ORIGIN_REQUIRED = '  WEB_ORIGIN: is required'
const DB_PASSWORD = 'secret-pass-123'
const PORT_PROBLEM = '  API_PORT: must be an integer from 1 to 65535'
const NODE_ENV_PROBLEM = '  NODE_ENV: must be one of: development, production, test'
const SECRET = 'secret-abc-123'
const SECRET_TOO_SHORT = `must be at least ${MIN_SECRET_BYTES} bytes`
const WEB_ORIGIN_NOT_URL = '  WEB_ORIGIN: must be an http:// or https:// URL'
const WEB_ORIGIN_NOT_ORIGIN = '  WEB_ORIGIN: must be an origin: lowercase, without path, query or trailing slash'
const WEB_ORIGIN_NEEDS_HTTPS = '  WEB_ORIGIN: must use https:// in production'
const WEB_ORIGIN_NO_HTTPS = '  WEB_ORIGIN: must not use https:// outside production'
const PROXY_PROBLEM = 'must be a comma-separated list of IP addresses or CIDR ranges'
const PROXY_TOO_WIDE = 'CIDR range is too wide: at least /16 for IPv4, /64 for IPv6, /112 within ::ffff:0:0/96'
const PROXY_IPV4_COMPATIBLE = 'CIDR ranges within deprecated ::/96 are not allowed'
const SECRET_EDGE_WHITESPACE = 'must not start or end with whitespace'
const PROXY_REQUIRED = '  TRUSTED_PROXY_IPS: is required in production'
const HMAC_SAME_AS_JWT = '  HMAC_SECRET: must differ from JWT_SECRET'
// Значение, которое не должно попасть в ошибку: длиннее минимума, чтобы проверялись и правила между полями
const LEAK_MARKER = 'qa-leak-marker-0123456789abcdefghij'
const ENV_EXAMPLE_PATH = fileURLToPath(new URL('../../../.env.example', import.meta.url))

const API_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CHILD_TIMEOUT_MS = 10_000
const TEST_TIMEOUT_MS = 15_000
// Порт для дочернего процесса: при поломке проверки сервер успел бы на нём запуститься
const CHILD_PORT = '3998'

function withoutKey(source: Record<string, string | undefined>, key: string) {
  return Object.fromEntries(Object.entries(source).filter(([name]) => name !== key))
}

function problemsOf(source: Record<string, string | undefined>) {
  return parseError(source).message
}

function expectOnly(source: Record<string, string | undefined>, problem: string) {
  expect(problemsOf(source)).toBe(`Invalid environment variables:\n${problem}`)
}

// KEY=VALUE построчно, без комментариев: формат .env.example простой
function readEnvExample(): Record<string, string> {
  const lines = readFileSync(ENV_EXAMPLE_PATH, 'utf8').split('\n')
  const entries = lines
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
  return Object.fromEntries(entries)
}

function parseError(source: Record<string, string | undefined>): Error {
  try {
    parseEnv(source)
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error('parseEnv threw a non-Error', { cause: error })
  }
  throw new Error('parseEnv did not throw')
}

describe('parseEnv: допустимые значения', () => {
  it('без NODE_ENV и API_PORT отдаёт значения по умолчанию', () => {
    expect(parseEnv(VALID)).toEqual(DEFAULT_ENV)
  })

  it('undefined считается отсутствующим значением', () => {
    expect(parseEnv({ ...VALID, NODE_ENV: undefined, API_PORT: undefined })).toEqual(DEFAULT_ENV)
  })

  it.each([
    ['development', VALID_LOCAL],
    ['production', VALID],
    ['test', VALID_LOCAL],
  ])('NODE_ENV %s', (value, base) => {
    expect(parseEnv({ ...base, NODE_ENV: value }).NODE_ENV).toBe(value)
  })

  it.each([
    ['1', 1],
    ['65535', 65535],
    ['3002', 3002],
    ['03002', 3002],
  ])('API_PORT %s → %i', (value, expected) => {
    expect(parseEnv({ ...VALID, API_PORT: value }).API_PORT).toBe(expected)
  })

  it('посторонние переменные не попадают в результат', () => {
    expect(parseEnv({ ...VALID_LOCAL, NODE_ENV: 'test', API_PORT: '3002', SESSION_SECRET: SECRET, PATH: '/bin' })).toEqual({
      NODE_ENV: 'test',
      API_PORT: 3002,
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: TEST_JWT_SECRET,
      HMAC_SECRET: TEST_HMAC_SECRET,
      WEB_ORIGIN: DEV_ORIGIN,
      TRUSTED_PROXY_IPS: [],
    })
  })

  it('не мутирует входной объект', () => {
    const source = { ...VALID, API_PORT: '03002', EXTRA: SECRET }

    parseEnv(source)

    expect(source).toEqual({ ...VALID, API_PORT: '03002', EXTRA: SECRET })
  })

  it('работает с замороженным объектом', () => {
    expect(parseEnv(Object.freeze({ ...VALID, API_PORT: '3002' })).API_PORT).toBe(3002)
  })
})

describe('parseEnv: отклоняемые значения', () => {
  it.each(['0', '65536', '', ' 3002 ', '3002\n', '1e3', '0x10', '-1', '+1', '3002.5', '٣٠٠٢', SECRET])(
    'API_PORT %j',
    (value) => {
      expect(parseError({ ...VALID, API_PORT: value }).message).toBe(`Invalid environment variables:\n${PORT_PROBLEM}`)
    },
  )

  it.each(['', 'Development', 'staging', ' production', SECRET])('NODE_ENV %j', (value) => {
    expect(parseError({ ...VALID, NODE_ENV: value }).message).toBe(`Invalid environment variables:\n${NODE_ENV_PROBLEM}`)
  })

  it('перечисляет все неверные переменные', () => {
    expect(parseError({ NODE_ENV: 'staging', API_PORT: '0' }).message).toBe(
      `Invalid environment variables:\n${NODE_ENV_PROBLEM}\n${PORT_PROBLEM}\n${DATABASE_URL_REQUIRED}\n${JWT_SECRET_REQUIRED}\n${HMAC_SECRET_REQUIRED}\n${WEB_ORIGIN_REQUIRED}`,
    )
  })

  it('бросает обычный Error без cause и без ZodError', () => {
    const error = parseError({ ...VALID, API_PORT: '0' })

    expect(Object.getPrototypeOf(error)).toBe(Error.prototype)
    expect(error.cause).toBeUndefined()
    expect(Object.keys(error)).toEqual([])
  })

  it.each([
    ['API_PORT', { API_PORT: SECRET }],
    ['API_PORT за пределами диапазона', { API_PORT: '99999123' }],
    ['NODE_ENV', { NODE_ENV: SECRET }],
    ['обе переменные', { NODE_ENV: SECRET, API_PORT: `${SECRET}-port` }],
  ])('в ошибке нет исходного значения: %s', (_name, source) => {
    const error = parseError({ ...VALID, ...source })
    const values = Object.values(source)

    for (const value of values) {
      expect(error.message).not.toContain(value)
      expect(inspect(error)).not.toContain(value)
    }
  })
})

describe('parseEnv: DATABASE_URL', () => {
  it('обязателен', () => {
    expect(parseError(withoutKey(VALID, 'DATABASE_URL')).message).toBe(`Invalid environment variables:\n${DATABASE_URL_REQUIRED}`)
  })

  it('undefined считается отсутствием', () => {
    expect(parseError({ ...VALID, DATABASE_URL: undefined }).message).toBe(`Invalid environment variables:\n${DATABASE_URL_REQUIRED}`)
  })

  it.each([
    TEST_DATABASE_URL,
    'postgres://qa_user:qa-fake-password@db.example.test:5432/qa_db',
    'postgresql://db.example.test/qa_db',
    'postgresql://qa_user:qa-fake-password@127.0.0.1:5432/qa_db?sslmode=require',
    'postgresql://[::1]:5432/qa_db',
    'POSTGRESQL://DB.example.test/qa_db',
  ])('принимает и возвращает как есть: %s', (value) => {
    expect(parseEnv({ ...VALID, DATABASE_URL: value }).DATABASE_URL).toBe(value)
  })

  it.each([
    '',
    'postgresql:',
    'postgresql://',
    'postgresql:///db',
    'postgresql://:5432/db',
    'postgresql:/db.example.test/db',
    'postgresqlx://db.example.test/db',
    'xpostgres://db.example.test/db',
    'mysql://qa_user:qa-fake-password@db.example.test/db',
    'https://db.example.test/db',
    'postgresql://db.example.test:99999/db',
    'postgresql://db example.test/db',
    'not a url at all',
  ])('отклоняет %j', (value) => {
    expect(parseError({ ...VALID, DATABASE_URL: value }).message).toBe(`Invalid environment variables:\n${DATABASE_URL_PROBLEM}`)
  })

  it.each([
    ['пустой хост', `postgresql://qa_user:${DB_PASSWORD}@/qa_db`],
    ['чужая схема', `mysql://qa_user:${DB_PASSWORD}@db.example.test/qa_db`],
    ['порт 99999', `postgresql://qa_user:${DB_PASSWORD}@db.example.test:99999/qa_db`],
    ['мусор', `garbage ${DB_PASSWORD}`],
  ])('пароля из адреса нет в ошибке: %s', (_name, value) => {
    const error = parseError({ ...VALID, DATABASE_URL: value })

    expect(error.message).not.toContain(DB_PASSWORD)
    expect(inspect(error)).not.toContain(DB_PASSWORD)
  })
})

describe('parseEnv: JWT_SECRET и HMAC_SECRET', () => {
  it.each(['JWT_SECRET', 'HMAC_SECRET'])('%s обязателен', (name) => {
    expectOnly({ ...VALID, [name]: undefined }, `  ${name}: is required`)
  })

  it.each([
    ['пустая строка', ''],
    [`${MIN_SECRET_BYTES - 1} байт`, 'j'.repeat(MIN_SECRET_BYTES - 1)],
    // 15 кириллических букв — 30 байт
    ['кириллица 30 байт', 'я'.repeat(15)],
  ])('JWT_SECRET короче минимума: %s', (_name, value) => {
    expectOnly({ ...VALID, JWT_SECRET: value }, `  JWT_SECRET: ${SECRET_TOO_SHORT}`)
  })

  // Любой символ из \s в JS: след копирования из редактора или браузера
  it.each([
    ['пробел', ' '],
    ['\\t', '\t'],
    ['\\r', '\r'],
    ['\\n', '\n'],
    ['\\r\\n', '\r\n'],
    ['\\v', '\v'],
    ['\\f', '\f'],
    ['NBSP U+00A0', '\u00a0'],
    ['BOM U+FEFF', '\ufeff'],
    ['U+2028', '\u2028'],
    ['идеографический пробел U+3000', '\u3000'],
  ])('пробельный символ по краю секрета: %s', (_name, char) => {
    for (const name of ['JWT_SECRET', 'HMAC_SECRET']) {
      const secret = name === 'JWT_SECRET' ? TEST_JWT_SECRET : TEST_HMAC_SECRET
      const problem = `  ${name}: ${SECRET_EDGE_WHITESPACE}`

      expectOnly({ ...VALID, [name]: `${char}${secret}` }, problem)
      expectOnly({ ...VALID, [name]: `${secret}${char}` }, problem)
    }
  })

  it.each([
    ['ZWSP U+200B: не \\s', '\u200b'],
    ['NEL U+0085: не \\s', '\u0085'],
    ['U+180E: не \\s', '\u180e'],
  ])('по краю секрета допустим: %s', (_name, char) => {
    const secret = `${char}${TEST_JWT_SECRET}${char}`

    expect(parseEnv({ ...VALID, JWT_SECRET: secret }).JWT_SECRET).toBe(secret)
  })

  it('32 пробела — ошибка пробелов по краю', () => {
    expectOnly({ ...VALID, JWT_SECRET: ' '.repeat(MIN_SECRET_BYTES) }, `  JWT_SECRET: ${SECRET_EDGE_WHITESPACE}`)
  })

  it('короткий секрет с пробелом по краю — обе ошибки', () => {
    expect(problemsOf({ ...VALID, JWT_SECRET: ' abc' })).toBe(
      `Invalid environment variables:\n  JWT_SECRET: ${SECRET_TOO_SHORT}\n  JWT_SECRET: ${SECRET_EDGE_WHITESPACE}`,
    )
  })

  it('пробел по краю и одинаковые секреты — только ошибка пробела', () => {
    const secret = `${TEST_JWT_SECRET} `

    expectOnly({ ...VALID, JWT_SECRET: secret, HMAC_SECRET: secret }, [
      `  JWT_SECRET: ${SECRET_EDGE_WHITESPACE}`,
      `  HMAC_SECRET: ${SECRET_EDGE_WHITESPACE}`,
    ].join('\n'))
  })

  it('HMAC_SECRET короче минимума', () => {
    expectOnly({ ...VALID, HMAC_SECRET: 'h'.repeat(MIN_SECRET_BYTES - 1) }, `  HMAC_SECRET: ${SECRET_TOO_SHORT}`)
  })

  it.each([
    ['ровно минимум', 'j'.repeat(MIN_SECRET_BYTES)],
    // Байты, а не символы: 16 кириллических букв — 32 байта
    ['кириллица 32 байта', 'я'.repeat(16)],
    ['эмодзи 32 байта', '😀'.repeat(8)],
  ])('JWT_SECRET принимается: %s', (_name, value) => {
    expect(Buffer.byteLength(value)).toBe(MIN_SECRET_BYTES)
    expect(parseEnv({ ...VALID, JWT_SECRET: value }).JWT_SECRET).toBe(value)
  })

  it('HMAC_SECRET не может совпадать с JWT_SECRET', () => {
    expectOnly({ ...VALID, HMAC_SECRET: TEST_JWT_SECRET }, HMAC_SAME_AS_JWT)
  })

  it('совпадающие короткие секреты — только ошибки длины', () => {
    expect(problemsOf({ ...VALID, JWT_SECRET: 'x', HMAC_SECRET: 'x' })).toBe(
      `Invalid environment variables:\n  JWT_SECRET: ${SECRET_TOO_SHORT}\n  HMAC_SECRET: ${SECRET_TOO_SHORT}`,
    )
  })

  it('секреты отличаются одним символом — допустимо', () => {
    const env = parseEnv({ ...VALID, HMAC_SECRET: `${TEST_JWT_SECRET}x` })

    expect(env.HMAC_SECRET).not.toBe(env.JWT_SECRET)
  })
})

describe('parseEnv: WEB_ORIGIN', () => {
  it('обязателен', () => {
    expectOnly({ ...VALID, WEB_ORIGIN: undefined }, WEB_ORIGIN_REQUIRED)
  })

  it.each([
    ['production', VALID, PROD_ORIGIN],
    ['production с портом', VALID, 'https://nataskium.example:8443'],
    ['production с IP', VALID, 'https://203.0.113.5'],
    ['production с punycode', VALID, 'https://xn--80a1acny.xn--p1ai'],
    ['development', { ...VALID_LOCAL, NODE_ENV: 'development' }, DEV_ORIGIN],
    ['test', { ...VALID_LOCAL, NODE_ENV: 'test' }, DEV_ORIGIN],
    ['development с IPv6', { ...VALID_LOCAL, NODE_ENV: 'development' }, 'http://[::1]:3000'],
  ])('принимает: %s', (_name, base, origin) => {
    expect(parseEnv({ ...base, WEB_ORIGIN: origin }).WEB_ORIGIN).toBe(origin)
  })

  it.each(['', 'nope', 'https:', 'ftp://nataskium.example', 'javascript://nataskium.example', 'file:///etc/passwd'])(
    'не http(s)-адрес: %j',
    (value) => {
      expectOnly({ ...VALID, WEB_ORIGIN: value }, WEB_ORIGIN_NOT_URL)
    },
  )

  it.each([
    ['путь', 'https://nataskium.example/app'],
    ['слэш в конце', 'https://nataskium.example/'],
    ['query', 'https://nataskium.example?x=1'],
    ['пустой fragment', 'https://nataskium.example#'],
    ['верхний регистр хоста', 'https://Nataskium.example'],
    ['верхний регистр схемы', 'HTTPS://nataskium.example'],
    ['порт по умолчанию', 'https://nataskium.example:443'],
    ['логин и пароль', 'https://user:pass@nataskium.example'],
    ['кириллический домен', 'https://почта.рф'],
  ])('не origin: %s', (_name, value) => {
    expectOnly({ ...VALID, WEB_ORIGIN: value }, WEB_ORIGIN_NOT_ORIGIN)
  })

  it('в production только https://', () => {
    expectOnly({ ...VALID, WEB_ORIGIN: 'http://nataskium.example' }, WEB_ORIGIN_NEEDS_HTTPS)
  })

  it('production по умолчанию: без NODE_ENV http:// тоже отклоняется', () => {
    expectOnly({ ...VALID, NODE_ENV: undefined, WEB_ORIGIN: DEV_ORIGIN }, WEB_ORIGIN_NEEDS_HTTPS)
  })

  it.each(['development', 'test'])('вне production https:// запрещён: %s', (nodeEnv) => {
    expectOnly({ ...VALID_LOCAL, NODE_ENV: nodeEnv, WEB_ORIGIN: PROD_ORIGIN }, WEB_ORIGIN_NO_HTTPS)
  })

  it('неверный адрес и одинаковые секреты — только ошибка адреса', () => {
    expectOnly({ ...VALID, WEB_ORIGIN: 'nope', HMAC_SECRET: TEST_JWT_SECRET }, WEB_ORIGIN_NOT_URL)
  })
})

describe('parseEnv: TRUSTED_PROXY_IPS', () => {
  it('список с пробелами вокруг элементов разбирается в массив', () => {
    const source = { ...VALID, TRUSTED_PROXY_IPS: ' 172.18.0.2, 172.18.0.0/16 ,fd00::/64, ::ffff:172.18.0.2' }

    expect(parseEnv(source).TRUSTED_PROXY_IPS).toEqual(['172.18.0.2', '172.18.0.0/16', 'fd00::/64', '::ffff:172.18.0.2'])
  })

  it.each([
    ['IPv4', '127.0.0.1', ['127.0.0.1']],
    ['IPv6', '::1', ['::1']],
    ['CIDR v4', '10.0.0.0/16', ['10.0.0.0/16']],
    ['CIDR v6', 'fd00::/64', ['fd00::/64']],
    ['пустые элементы пропускаются', '172.18.0.2,,', ['172.18.0.2']],
  ])('принимает: %s', (_name, value, expected) => {
    expect(parseEnv({ ...VALID, TRUSTED_PROXY_IPS: value }).TRUSTED_PROXY_IPS).toEqual(expected)
  })

  it.each([
    ['не указан', undefined],
    ['пустая строка', ''],
    ['только запятые и пробелы', ' , '],
  ])('в production обязателен: %s', (_name, value) => {
    expectOnly({ ...VALID, TRUSTED_PROXY_IPS: value }, PROXY_REQUIRED)
  })

  it.each(['development', 'test'])('вне production необязателен, но допустим: %s', (nodeEnv) => {
    const local = { ...VALID_LOCAL, NODE_ENV: nodeEnv }

    expect(parseEnv(local).TRUSTED_PROXY_IPS).toEqual([])
    expect(parseEnv({ ...local, TRUSTED_PROXY_IPS: '127.0.0.1' }).TRUSTED_PROXY_IPS).toEqual(['127.0.0.1'])
  })

  it.each([
    ['имя хоста', 'caddy', 0],
    ['имя хоста вторым элементом', '172.18.0.2,caddy', 1],
    ['localhost', 'localhost', 0],
    ['ведущий ноль', '172.018.0.2', 0],
    ['маска /33', '172.18.0.0/33', 0],
    ['маска /129', 'fd00::/129', 0],
    ['IPv6 в скобках', '[::1]', 0],
    ['IPv6 с зоной', 'fe80::1%eth0', 0],
    ['точка с запятой', '172.18.0.2;172.18.0.3', 0],
    ['пробел вместо запятой', '172.18.0.2 172.18.0.3', 0],
  ])('отклоняет: %s', (_name, value, index) => {
    expectOnly({ ...VALID, TRUSTED_PROXY_IPS: value }, `  TRUSTED_PROXY_IPS.${index}: ${PROXY_PROBLEM}`)
  })

  // Доверие всем адресам: любой клиент подставит свой X-Real-IP и обойдёт rate limit
  it.each([
    ['0.0.0.0/0', 0],
    ['::/0', 0],
    ['172.18.0.2,0.0.0.0/0', 1],
    ['1.2.3.4/0', 0],
  ])('отклоняет доверие всему интернету: %s', (value, index) => {
    expectOnly({ ...VALID, TRUSTED_PROXY_IPS: value }, `  TRUSTED_PROXY_IPS.${index}: ${PROXY_TOO_WIDE}`)
  })

  it.each([
    ['IPv4 /16', '10.0.0.0/16'],
    ['IPv4 /16 с битами хоста', '172.18.0.2/16'],
    ['IPv4 /32', '10.0.0.1/32'],
    ['IPv6 /64', 'fd00::/64'],
    ['IPv6 /64 в верхнем регистре', 'FD00::/64'],
    ['IPv6 /128', '::1/128'],
    ['IPv4 в IPv6 /112', '::ffff:172.18.0.0/112'],
    ['IPv4 в IPv6 /120 с точками', '::ffff:1.2.3.4/120'],
    ['::ffff:0:0/112', '::ffff:0:0/112'],
    ['IPv6 /96 рядом с IPv4-блоком', '::fffe:0:0/96'],
  ])('ширина сети на границе допустимого: %s', (_name, value) => {
    expect(parseEnv({ ...VALID, TRUSTED_PROXY_IPS: value }).TRUSTED_PROXY_IPS).toEqual([value])
  })

  it.each([
    ['IPv4 /15', '10.0.0.0/15'],
    ['IPv4 /8', '10.0.0.0/8'],
    ['IPv6 /63', 'fd00::/63'],
    ['IPv6 /8', 'fd00::/8'],
    // ::/64 включает весь ::ffff:0:0/96, то есть все IPv4-адреса
    ['::/64 перекрывает IPv4-блок', '::/64'],
    ['::/80 перекрывает IPv4-блок', '::/80'],
    ['весь IPv4-блок ::ffff:0:0/96', '::ffff:0:0/96'],
    ['шире IPv4-блока ::ffff:0:0/95', '::ffff:0:0/95'],
    ['IPv4 в IPv6 /111', '::ffff:172.18.0.0/111'],
    ['IPv4 в IPv6 /96 с точками', '::ffff:1.2.3.4/96'],
  ])('слишком широкая сеть: %s', (_name, value) => {
    expectOnly({ ...VALID, TRUSTED_PROXY_IPS: value }, `  TRUSTED_PROXY_IPS.0: ${PROXY_TOO_WIDE}`)
  })

  // Устаревший IPv4-compatible блок ::/96 (RFC 4291): диапазоны в нём запрещены, отдельные адреса — нет
  it.each([
    ['весь блок', '::/96'],
    ['весь блок в полной записи', '0:0:0:0:0:0:0:0/96'],
    ['/97 внутри блока', '::/97'],
    ['/112 внутри блока', '::/112'],
    ['IPv4 с точками /120', '::1.2.3.0/120'],
    ['::1/127', '::1/127'],
    ['IPv4 в hex', '::a00:0/112'],
    ['IPv4 с точками', '::10.0.0.0/112'],
  ])('диапазон в ::/96: %s', (_name, value) => {
    expectOnly({ ...VALID, TRUSTED_PROXY_IPS: value }, `  TRUSTED_PROXY_IPS.0: ${PROXY_IPV4_COMPATIBLE}`)
  })

  it.each([
    ['::1 без маски', '::1'],
    ['::1/128', '::1/128'],
    [':: без маски', '::'],
    ['::/128', '::/128'],
    ['соседний /96 вне блока', '::1:0:0/96'],
  ])('адрес или сеть вне диапазонов ::/96 допустимы: %s', (_name, value) => {
    expect(parseEnv({ ...VALID, TRUSTED_PROXY_IPS: value }).TRUSTED_PROXY_IPS).toEqual([value])
  })

  // ::/64 и ::/80 накрывают и ::ffff:0:0/96, и ::/96; полная запись ::ffff:0:0/96 — тот же IPv4-блок
  it.each(['::/64', '::/80', '0:0:0:0:0:ffff:0:0/96'])('%s — одна ошибка ширины, без второй про ::/96', (value) => {
    expectOnly({ ...VALID, TRUSTED_PROXY_IPS: value }, `  TRUSTED_PROXY_IPS.0: ${PROXY_TOO_WIDE}`)
  })

  it('широкая сеть не мешает найти мусор в другом элементе', () => {
    expect(problemsOf({ ...VALID, TRUSTED_PROXY_IPS: '0.0.0.0/0,caddy' })).toBe(
      `Invalid environment variables:\n  TRUSTED_PROXY_IPS.0: ${PROXY_TOO_WIDE}\n  TRUSTED_PROXY_IPS.1: ${PROXY_PROBLEM}`,
    )
  })

  it.each([
    ['ведущий ноль в маске IPv4', '10.0.0.0/016'],
    ['ведущий ноль в маске IPv6', 'fd00::/064'],
    ['дробная маска', '10.0.0.0/16.0'],
    ['пробел в маске', '10.0.0.0/ 16'],
  ])('маска в неверном формате — ошибка формата, а не ширины: %s', (_name, value) => {
    expectOnly({ ...VALID, TRUSTED_PROXY_IPS: value }, `  TRUSTED_PROXY_IPS.0: ${PROXY_PROBLEM}`)
  })
})

describe('parseEnv: секретов нет в ошибке', () => {
  it.each([
    ['короткий JWT_SECRET', { JWT_SECRET: 'qa-leak-short' }],
    ['короткий HMAC_SECRET', { HMAC_SECRET: 'qa-leak-short' }],
    ['одинаковые секреты', { JWT_SECRET: LEAK_MARKER, HMAC_SECRET: LEAK_MARKER }],
    ['WEB_ORIGIN не URL', { WEB_ORIGIN: `https://${LEAK_MARKER} x` }],
    ['WEB_ORIGIN с паролем', { WEB_ORIGIN: `https://user:${LEAK_MARKER}@nataskium.example` }],
    ['WEB_ORIGIN с путём', { WEB_ORIGIN: `https://nataskium.example/${LEAK_MARKER}` }],
    ['http в production', { WEB_ORIGIN: `http://${LEAK_MARKER}.example` }],
    ['TRUSTED_PROXY_IPS', { TRUSTED_PROXY_IPS: `172.18.0.2,${LEAK_MARKER}` }],
  ])('%s', (_name, source) => {
    const error = parseError({ ...VALID, ...source })

    for (const value of Object.values(source)) {
      expect(error.message).not.toContain(value)
      expect(inspect(error)).not.toContain(value)
    }
    expect(error.message).not.toContain('qa-leak')
    expect(inspect(error)).not.toContain('qa-leak')
  })

  it.each([
    ['пробел внутри', `qa-fake-jwt ${TEST_JWT_SECRET}`],
    ['табуляция внутри', `qa-fake-jwt\t${TEST_JWT_SECRET}`],
  ])('результат разбора содержит секрет как есть: %s', (_name, secret) => {
    expect(parseEnv({ ...VALID, JWT_SECRET: secret }).JWT_SECRET).toBe(secret)
  })

  it('секрет с пробелом по краю: значения нет в ошибке', () => {
    const error = parseError({ ...VALID, JWT_SECRET: ` ${LEAK_MARKER}` })

    expect(error.message).not.toContain('qa-leak')
    expect(inspect(error)).not.toContain('qa-leak')
  })
})

describe('parseEnv: RESEND_API_KEY и EMAIL_FROM', () => {
  const KEY_REQUIRED = '  RESEND_API_KEY: is required in production'
  const FROM_REQUIRED = '  EMAIL_FROM: is required in production'
  const TEST_DOMAIN = '  EMAIL_FROM: must not use the resend.dev test domain in production'
  const TOGETHER = '  EMAIL_FROM: RESEND_API_KEY and EMAIL_FROM must be set together'
  const KEY_WHITESPACE = '  RESEND_API_KEY: must not start or end with whitespace'
  const FROM_NOT_EMAIL = '  EMAIL_FROM: must be an email address'
  const DEVELOPMENT = { ...VALID_LOCAL, NODE_ENV: 'development' }

  it('production: оба заданы — возвращаются как есть', () => {
    expect(parseEnv(VALID)).toMatchObject({ RESEND_API_KEY: TEST_RESEND_KEY, EMAIL_FROM: TEST_EMAIL_FROM })
  })

  it.each([
    ['ключ не задан', { RESEND_API_KEY: undefined }, KEY_REQUIRED],
    ['ключ — пустая строка, как в .env.example', { RESEND_API_KEY: '' }, KEY_REQUIRED],
    ['оба не заданы — сначала ключ', { RESEND_API_KEY: undefined, EMAIL_FROM: undefined }, KEY_REQUIRED],
    ['оба пустые', { RESEND_API_KEY: '', EMAIL_FROM: '' }, KEY_REQUIRED],
    ['отправитель не задан', { EMAIL_FROM: undefined }, FROM_REQUIRED],
    ['отправитель — пустая строка', { EMAIL_FROM: '' }, FROM_REQUIRED],
  ])('production: %s', (_name, override, problem) => {
    expectOnly({ ...VALID, ...override }, problem)
  })

  it('production по умолчанию: без NODE_ENV почта тоже обязательна', () => {
    expectOnly({ ...VALID, NODE_ENV: undefined, RESEND_API_KEY: undefined }, KEY_REQUIRED)
  })

  it.each(['onboarding@resend.dev', 'qa@mail.resend.dev', 'QA@RESEND.DEV'])('production: тестовый домен %s запрещён', (from) => {
    expectOnly({ ...VALID, EMAIL_FROM: from }, TEST_DOMAIN)
  })

  it.each(['qa@notresend.dev', 'qa@resend.dev.example.com'])('production: похожий, но другой домен %s допустим', (from) => {
    expect(parseEnv({ ...VALID, EMAIL_FROM: from }).EMAIL_FROM).toBe(from)
  })

  it.each([
    ['ничего не задано', {}],
    ['оба пустые', { RESEND_API_KEY: '', EMAIL_FROM: '' }],
  ])('вне production почта необязательна: %s', (_name, override) => {
    const env = parseEnv({ ...DEVELOPMENT, ...override })

    expect(env.RESEND_API_KEY).toBeUndefined()
    expect(env.EMAIL_FROM).toBeUndefined()
  })

  it.each(['development', 'test'])('вне production (%s) тестовый домен resend.dev допустим', (nodeEnv) => {
    const env = parseEnv({ ...VALID_LOCAL, NODE_ENV: nodeEnv, RESEND_API_KEY: TEST_RESEND_KEY, EMAIL_FROM: 'onboarding@resend.dev' })

    expect(env.EMAIL_FROM).toBe('onboarding@resend.dev')
  })

  it.each([
    ['только ключ', { RESEND_API_KEY: TEST_RESEND_KEY }],
    ['только отправитель', { EMAIL_FROM: TEST_EMAIL_FROM }],
    ['ключ и пустой отправитель', { RESEND_API_KEY: TEST_RESEND_KEY, EMAIL_FROM: '' }],
  ])('вне production — оба или ни одного: %s', (_name, override) => {
    expectOnly({ ...DEVELOPMENT, ...override }, TOGETHER)
  })

  it.each([' ', '\t', '\n', '\r\n', '\u00a0'])(
    'ключ с пробельным символом по краю — ошибка: %j',
    (char) => {
      expectOnly({ ...VALID, RESEND_API_KEY: `${char}${TEST_RESEND_KEY}` }, KEY_WHITESPACE)
      expectOnly({ ...VALID, RESEND_API_KEY: `${TEST_RESEND_KEY}${char}` }, KEY_WHITESPACE)
    },
  )

  const KEY_FORMAT = '  RESEND_API_KEY: must start with re_ and be at least 20 characters'
  const MIN_KEY_LENGTH = 20

  it.each([
    ['ровно 20 символов', `re_${'k'.repeat(MIN_KEY_LENGTH - 3)}`],
    ['длинный', `re_${'k'.repeat(60)}`],
  ])('ключ Resend принимается: %s', (_name, key) => {
    expect(key.length).toBeGreaterThanOrEqual(MIN_KEY_LENGTH)
    expect(parseEnv({ ...VALID, RESEND_API_KEY: key }).RESEND_API_KEY).toBe(key)
  })

  it.each([
    ['19 символов', `re_${'k'.repeat(MIN_KEY_LENGTH - 4)}`],
    ['только префикс', 're_'],
    ['без префикса', 'k'.repeat(MIN_KEY_LENGTH + 10)],
    ['RE_ в верхнем регистре', `RE_${'k'.repeat(MIN_KEY_LENGTH)}`],
    ['префикс не в начале', `k_re_${'k'.repeat(MIN_KEY_LENGTH)}`],
    ['плейсхолдер из документации', 'your-resend-api-key'],
  ])('ключ Resend неверного формата: %s', (_name, key) => {
    expectOnly({ ...VALID, RESEND_API_KEY: key }, KEY_FORMAT)
  })

  it('ключ неверного формата вне production — та же ошибка', () => {
    expectOnly({ ...DEVELOPMENT, RESEND_API_KEY: 'short', EMAIL_FROM: TEST_EMAIL_FROM }, KEY_FORMAT)
  })

  it('ключ с пробелом по краю — только ошибка пробела, без ошибки формата', () => {
    expectOnly({ ...VALID, RESEND_API_KEY: ' short' }, KEY_WHITESPACE)
  })

  it.each([
    ['короткий', `re_${LEAK_MARKER.slice(0, 10)}`],
    ['без префикса', LEAK_MARKER],
  ])('значения ключа неверного формата нет в ошибке: %s', (_name, key) => {
    const error = parseError({ ...VALID, RESEND_API_KEY: key })

    expect(error.message).not.toContain(key)
    expect(error.message).not.toContain('qa-leak')
    expect(inspect(error)).not.toContain('qa-leak')
  })

  it.each(['not-an-email', 'Nataskium <noreply@nataskium.example>', ' noreply@nataskium.example ', 'noreply@'])(
    'отправитель не email: %j',
    (from) => {
      expectOnly({ ...VALID, EMAIL_FROM: from }, FROM_NOT_EMAIL)
    },
  )

  it.each([
    ['ключ с пробелом', { RESEND_API_KEY: ` ${LEAK_MARKER}` }],
    ['ключ без отправителя вне production', { NODE_ENV: 'development', WEB_ORIGIN: DEV_ORIGIN, TRUSTED_PROXY_IPS: undefined, RESEND_API_KEY: LEAK_MARKER, EMAIL_FROM: undefined }],
    ['ключ при тестовом домене', { RESEND_API_KEY: LEAK_MARKER, EMAIL_FROM: 'onboarding@resend.dev' }],
    ['ключ в поле отправителя', { EMAIL_FROM: LEAK_MARKER }],
  ])('ключа нет в ошибке: %s', (_name, override) => {
    const error = parseError({ ...VALID, ...override })

    expect(error.message).not.toContain('qa-leak')
    expect(inspect(error)).not.toContain('qa-leak')
  })
})

describe('.env.example', () => {
  it('с заполненными секретами и паролем проходит проверку для development', () => {
    const example = readEnvExample()
    const env = parseEnv({
      ...example,
      NODE_ENV: 'development',
      DATABASE_URL: example.DATABASE_URL?.replace(':@', ':qa-fake-password@'),
      JWT_SECRET: TEST_JWT_SECRET,
      HMAC_SECRET: TEST_HMAC_SECRET,
    })

    expect(env.WEB_ORIGIN).toBe(DEV_ORIGIN)
    expect(env.TRUSTED_PROXY_IPS).toEqual([])
  })

  it.each(['JWT_SECRET', 'HMAC_SECRET', 'POSTGRES_PASSWORD'])('%s в примере пустой', (name) => {
    expect(readEnvExample()[name]).toBe('')
  })
})

describe('запуск сервера при неверном окружении', () => {
  function runServer(env: Record<string, string | undefined>) {
    return spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: API_ROOT,
      // undefined убирает переменную, унаследованную из окружения разработчика
      env: { ...process.env, ...env },
      encoding: 'utf8',
      timeout: CHILD_TIMEOUT_MS,
    })
  }

  it.each([
    ['NODE_ENV', SECRET, { ...VALID, NODE_ENV: SECRET, API_PORT: CHILD_PORT }],
    ['API_PORT', SECRET, { ...VALID, NODE_ENV: 'production', API_PORT: SECRET }],
    ['JWT_SECRET', 'qa-leak-short', { ...VALID, NODE_ENV: 'production', API_PORT: CHILD_PORT, JWT_SECRET: 'qa-leak-short' }],
    ['HMAC_SECRET', TEST_JWT_SECRET, { ...VALID, NODE_ENV: 'production', API_PORT: CHILD_PORT, HMAC_SECRET: TEST_JWT_SECRET }],
    ['DATABASE_URL', DB_PASSWORD, { ...VALID, NODE_ENV: 'production', API_PORT: CHILD_PORT, DATABASE_URL: `mysql://qa_user:${DB_PASSWORD}@db.example.test/qa_db` }],
  ])('%s: выход с кодом 1, сервер не стартует, значения нет в выводе', (name, secret, env) => {
    const child = runServer(env)

    expect(child.status).toBe(1)
    expect(child.stderr).toContain(name)
    expect(child.stdout).not.toContain('API started')
    expect(child.stdout).not.toContain(secret)
    expect(child.stderr).not.toContain(secret)
  }, TEST_TIMEOUT_MS)

  it('без DATABASE_URL: выход с кодом 1 и понятная причина', () => {
    const child = runServer({ ...VALID, NODE_ENV: 'production', API_PORT: CHILD_PORT, DATABASE_URL: undefined })

    expect(child.status).toBe(1)
    expect(child.stderr).toContain(DATABASE_URL_REQUIRED.trim())
    expect(child.stdout).not.toContain('API started')
  }, TEST_TIMEOUT_MS)
})
