import { describe, expect, it } from 'vitest'
import type { ZodType } from 'zod'
import { emailSchema, passwordSchema } from './index'
import { COMMON_PASSWORDS } from './passwordBlocklist'

const MAX_EMAIL_LENGTH = 254
const MIN_PASSWORD_LENGTH = 4
const MAX_PASSWORD_LENGTH = 128
const MAX_LOCAL_PART_LENGTH = 64
const PASSWORD_TOO_SHORT = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
const PASSWORD_TOO_LONG = `Password must be at most ${MAX_PASSWORD_LENGTH} characters`
const PASSWORD_INVALID_CHARS = 'Password contains invalid characters'
const PASSWORD_TOO_COMMON = 'Password is too common'
const LOCAL_PART_TOO_LONG = `Email must have at most ${MAX_LOCAL_PART_LENGTH} characters before @`
const EMAIL_SECRET = 'secret-mail-123'
const NON_ASCII_LOCAL_MESSAGE = 'Email must use only Latin letters, digits and symbols before @'
// Время разбора враждебной строки: с большим запасом, чтобы тест не зависел от скорости машины
const HOSTILE_INPUT_BUDGET_MS = 250
const HOSTILE_INPUT_SIZE = 100 * 1024
const PASSWORD_SECRET = 'secret-pass-123'
// U+1F400 🐀 и дальше подряд: разные эмодзи вне BMP, чтобы пароль не попал под правило повтора
const FIRST_DISTINCT_EMOJI = 0x1f400

const NON_STRINGS: [string, unknown][] = [
  ['число', 42],
  ['null', null],
  ['undefined', undefined],
  ['объект', { email: 'a@example.com' }],
  ['массив', ['a@example.com']],
  ['boolean', true],
  ['bigint', BigInt(1)],
  ['Symbol', Symbol('a')],
]

// Строковые обёртки и объекты со строковым видом: на границе HTTP приходит unknown
const STRING_LIKE: [string, unknown][] = [
  ['new String', new String('teacher@example.com')],
  ['функция', () => 'teacher@example.com'],
  ['Date', new Date(0)],
  ['объект с toString', { toString: () => 'teacher@example.com' }],
]

// Длина ровно `length`: имя ящика максимальной длины, домен из меток по 61 символу
function emailOfLength(length: number) {
  const local = 'a'.repeat(MAX_LOCAL_PART_LENGTH)
  const labels = ['b'.repeat(61), 'c'.repeat(61), 'd'.repeat(61)].join('.')
  const tld = 'e'.repeat(length - local.length - 1 - labels.length - 1)
  return `${local}@${labels}.${tld}`
}

// Домен из меток b…, c…, d… и почта.рф (в punycode xn--80a1acny.xn--p1ai)
function idnEmailOfAsciiLength(length: number) {
  const prefix = `${'a'.repeat(MAX_LOCAL_PART_LENGTH)}@${'b'.repeat(61)}.${'c'.repeat(61)}.`
  const idnSuffix = 'почта.рф'
  const asciiSuffix = 'xn--80a1acny.xn--p1ai'
  const pad = 'd'.repeat(length - prefix.length - asciiSuffix.length - 1)

  return { input: `${prefix}${pad}.${idnSuffix}`, ascii: `${prefix}${pad}.${asciiSuffix}` }
}

function distinctEmoji(count: number) {
  return Array.from({ length: count }, (_, i) => String.fromCodePoint(FIRST_DISTINCT_EMOJI + i)).join('')
}

function messagesOf(schema: ZodType, value: unknown) {
  return schema.safeParse(value).error?.issues.map((issue) => issue.message)
}

function issuesText(result: { success: boolean; error?: { issues: unknown[] } }) {
  return JSON.stringify(result.error?.issues ?? [])
}

describe('emailSchema: нормализация', () => {
  it.each([
    ['регистр', 'Teacher@Example.COM', 'teacher@example.com'],
    ['пробелы и переводы строк по краям', '  teacher@example.com \t\r\n', 'teacher@example.com'],
    ['NBSP по краям', '\u00a0teacher@example.com\u00a0', 'teacher@example.com'],
    ['пробелы и регистр вместе', ' \u00a0TEACHER@EXAMPLE.COM\n', 'teacher@example.com'],
    ['плюс в адресе', 'Teacher+Tag@Example.com', 'teacher+tag@example.com'],
  ])('%s', (_name, input, expected) => {
    expect(emailSchema.parse(input)).toBe(expected)
  })

  it(`принимает ровно ${MAX_EMAIL_LENGTH} символов`, () => {
    const email = emailOfLength(MAX_EMAIL_LENGTH)

    expect(email).toHaveLength(MAX_EMAIL_LENGTH)
    expect(emailSchema.parse(email)).toBe(email)
  })

  it('длина считается после обрезки пробелов', () => {
    const email = emailOfLength(MAX_EMAIL_LENGTH)

    expect(emailSchema.parse(`  ${email}  `)).toBe(email)
  })
})

describe('emailSchema: отклоняемые значения', () => {
  it.each([
    '',
    '   ',
    'teacher',
    'teacher@',
    '@example.com',
    'teacher@localhost',
    'teacher@@example.com',
    'tea cher@example.com',
    'a..b@example.com',
  ])('%j — Invalid email', (value) => {
    expect(messagesOf(emailSchema, value)).toEqual(['Invalid email'])
  })

  it('U+200B в начале — не-ASCII в имени ящика', () => {
    expect(messagesOf(emailSchema, '\u200bteacher@example.com')).toEqual([NON_ASCII_LOCAL_MESSAGE])
  })

  it(`длиннее ${MAX_EMAIL_LENGTH} символов`, () => {
    expect(messagesOf(emailSchema, emailOfLength(MAX_EMAIL_LENGTH + 1))).toEqual([
      `Email must be at most ${MAX_EMAIL_LENGTH} characters`,
    ])
  })

  it.each(NON_STRINGS)('%s — ошибка без исключения', (_name, value) => {
    expect(messagesOf(emailSchema, value)).toEqual(['Email must be a string'])
  })

  it.each([
    ['не email', `${EMAIL_SECRET}`],
    ['не email с @', `${EMAIL_SECRET}@`],
    ['слишком длинный', `${EMAIL_SECRET}${emailOfLength(MAX_EMAIL_LENGTH)}`],
  ])('в ошибке нет введённого значения: %s', (_name, value) => {
    expect(issuesText(emailSchema.safeParse(value))).not.toContain(EMAIL_SECRET)
  })
})

describe('passwordSchema', () => {
  it.each([
    ['ровно минимум', 'x'.repeat(MIN_PASSWORD_LENGTH - 1) + 'k'],
    ['ровно максимум', 'x'.repeat(MAX_PASSWORD_LENGTH - 1) + 'k'],
  ])('принимает: %s', (_name, password) => {
    expect(passwordSchema.parse(password)).toBe(password)
  })

  it.each([
    ['короче минимума', 'x'.repeat(MIN_PASSWORD_LENGTH - 1), `Password must be at least ${MIN_PASSWORD_LENGTH} characters`],
    ['длиннее максимума', 'x'.repeat(MAX_PASSWORD_LENGTH + 1), `Password must be at most ${MAX_PASSWORD_LENGTH} characters`],
  ])('отклоняет: %s', (_name, password, message) => {
    expect(messagesOf(passwordSchema, password)).toEqual([message])
  })

  it.each(['password', 'PASSWORD', 'PaSsWoRd', 'qwerty', 'QWERTY', '123456', 'iloveyou', 'ILoveYou'])(
    'популярный пароль в любом регистре: %s',
    (password) => {
      expect(messagesOf(passwordSchema, password)).toEqual([
        'Password is too common',
      ])
    },
  )

  it('отклоняет каждый пароль из списка популярных', () => {
    const accepted = [...COMMON_PASSWORDS].filter((password) => passwordSchema.safeParse(password).success)

    expect(accepted).toEqual([])
  })

  it('список популярных паролей в нижнем регистре, иначе сравнение не сработает', () => {
    const notLowerCase = [...COMMON_PASSWORDS].filter((password) => password !== password.toLowerCase())

    expect(notLowerCase).toEqual([])
  })

  it.each([
    ['пробелы по краям', '  my secret phrase  '],
    ['табуляция и перевод строки', '\tmy secret\n'],
    ['регистр', 'MySecretPhrase'],
  ])('не изменяет пароль: %s', (_name, password) => {
    expect(passwordSchema.parse(password)).toBe(password)
  })

  // Zod 4 после ошибки типа ещё проверяет длину массива, поэтому сравнивается только первое сообщение
  it.each(NON_STRINGS)('%s — ошибка без исключения', (_name, value) => {
    expect(messagesOf(passwordSchema, value)?.[0]).toBe('Password must be a string')
  })

  it.each([
    ['короткий', PASSWORD_SECRET.slice(0, MIN_PASSWORD_LENGTH - 1)],
    ['длинный', PASSWORD_SECRET.repeat(10)],
    ['популярный', 'qwerty'],
  ])('в ошибке нет введённого пароля: %s', (_name, password) => {
    expect(issuesText(passwordSchema.safeParse(password))).not.toContain(password)
  })
})

describe('emailSchema: домен в punycode', () => {
  it.each([
    ['кириллический домен', 'teacher@почта.рф', 'teacher@xn--80a1acny.xn--p1ai'],
    ['регистр и пробелы вокруг', '  Teacher@ПОЧТА.РФ \n', 'teacher@xn--80a1acny.xn--p1ai'],
    ['ü в NFC', 'anna@b\u00fccher.de', 'anna@xn--bcher-kva.de'],
    ['ü в NFD', 'anna@bu\u0308cher.de', 'anna@xn--bcher-kva.de'],
    ['punycode как есть', 'teacher@xn--80a1acny.xn--p1ai', 'teacher@xn--80a1acny.xn--p1ai'],
    ['punycode в верхнем регистре', 'Teacher@XN--80A1ACNY.XN--P1AI', 'teacher@xn--80a1acny.xn--p1ai'],
  ])('%s', (_name, input, expected) => {
    expect(emailSchema.parse(input)).toBe(expected)
  })

  it('NFC и NFD дают один и тот же адрес', () => {
    expect(emailSchema.parse('anna@b\u00fccher.de')).toBe(emailSchema.parse('anna@bu\u0308cher.de'))
  })

  it(`${MAX_EMAIL_LENGTH} символа после перевода в punycode принимаются`, () => {
    const { input, ascii } = idnEmailOfAsciiLength(MAX_EMAIL_LENGTH)

    expect(ascii).toHaveLength(MAX_EMAIL_LENGTH)
    expect(input.length).toBeLessThan(MAX_EMAIL_LENGTH)
    expect(emailSchema.parse(input)).toBe(ascii)
  })

  it(`${MAX_EMAIL_LENGTH + 1} символ после перевода отклоняется, хотя исходный адрес короче`, () => {
    const { input, ascii } = idnEmailOfAsciiLength(MAX_EMAIL_LENGTH + 1)

    expect(ascii).toHaveLength(MAX_EMAIL_LENGTH + 1)
    expect(input.length).toBeLessThan(MAX_EMAIL_LENGTH)
    expect(messagesOf(emailSchema, input)).toEqual([`Email must be at most ${MAX_EMAIL_LENGTH} characters`])
  })

  it.each([
    ['кириллица в имени', 'учитель@example.com'],
    ['кириллическая «а» в latin-адресе', 'teаcher@example.com'],
    ['ü в имени', 'j\u00fcrgen@example.com'],
    ['NFD в имени', 'ju\u0308rgen@example.com'],
  ])('не-ASCII в имени ящика: %s', (_name, value) => {
    expect(messagesOf(emailSchema, value)).toEqual([NON_ASCII_LOCAL_MESSAGE])
  })

  it.each([
    ['порт', 'a@example.com:80'],
    ['путь', 'a@example.com/x'],
    ['?', 'a@example.com?x'],
    ['#', 'a@example.com#x'],
    ['%', 'a@exa%41mple.com'],
    ['обратная косая', 'a@example\\com'],
    ['обратная косая после домена', 'a@example.com\\evil'],
    ['второй @', 'a@b@example.com'],
    ['пробел', 'a@exa mple.com'],
    ['табуляция', 'a@exa\tmple.com'],
    ['перевод строки', 'a@exa\nmple.com'],
    ['возврат каретки', 'a@exa\rmple.com'],
    ['NUL', 'a@exa\u0000mple.com'],
    ['управляющий U+0001', 'a@exa\u0001mple.com'],
    ['DEL', 'a@exa\u007fmple.com'],
    ['NBSP внутри', 'a@exa\u00a0mple.com'],
    ['идеографический пробел', 'a@exa\u3000mple.com'],
    ['IPv4', 'a@127.0.0.1'],
    ['IPv4 сокращённый', 'a@127.1'],
    ['IPv4 шестнадцатеричный', 'a@0x7f.1'],
    ['IPv4 восьмеричный', 'a@0177.0.0.1'],
    ['IPv4 одним числом', 'a@2130706433'],
    ['IPv6 в скобках', 'a@[::1]'],
    ['IPv6 без скобок', 'a@::1'],
    ['пустой домен', 'a@'],
    ['домен из точки', 'a@.'],
    ['числовая зона', 'a@example.123'],
    ['зона из одной буквы', 'a@example.c'],
    ['метка длиннее 63', `a@${'b'.repeat(64)}.com`],
    ['точка в конце', 'a@example.com.'],
    ['подчёркивание', 'a@ex_ample.com'],
    ['дефис в начале метки', 'a@-example.com'],
    ['дефис в конце метки', 'a@example-.com'],
    ['пустой punycode', 'a@xn--.com'],
    ['ZWJ', 'a@exa\u200dmple.com'],
    // URL молча удалил бы BOM и получил example.com
    ['BOM внутри', 'a@exa\ufeffmple.com'],
  ])('отклоняет домен: %s', (_name, value) => {
    expect(messagesOf(emailSchema, value)).toEqual(['Invalid email'])
  })

  it('слишком длинный и неверный адрес — только ошибка длины', () => {
    expect(messagesOf(emailSchema, `a@${'b'.repeat(300)}.com`)).toEqual([`Email must be at most ${MAX_EMAIL_LENGTH} characters`])
  })

  it('метка ровно 63 символа принимается', () => {
    const email = `a@${'b'.repeat(63)}.com`

    expect(emailSchema.parse(email)).toBe(email)
  })

  it.each([
    ['не-ASCII имя', `${EMAIL_SECRET}-учитель@example.com`],
    ['порт в домене', `a@${EMAIL_SECRET}.com:80`],
    ['IPv4', `${EMAIL_SECRET}@127.0.0.1`],
    ['IDN длиннее лимита', `${EMAIL_SECRET}${idnEmailOfAsciiLength(MAX_EMAIL_LENGTH + 1).input}`],
  ])('в ошибке нет введённого значения: %s', (_name, value) => {
    const result = emailSchema.safeParse(value)

    expect(result.success).toBe(false)
    expect(issuesText(result)).not.toContain(EMAIL_SECRET)
  })

  it.each([
    ['длинная ASCII-метка', `a@${'b'.repeat(HOSTILE_INPUT_SIZE)}`],
    ['много точек', `a@${'b.'.repeat(HOSTILE_INPUT_SIZE / 2)}com`],
    ['одинаковые не-ASCII', `a@${'ä'.repeat(HOSTILE_INPUT_SIZE / 2)}.de`],
    ['разные не-ASCII', `a@${Array.from({ length: HOSTILE_INPUT_SIZE / 4 }, (_, i) => String.fromCodePoint(0x100 + i * 7)).join('')}.com`],
    ['эмодзи', `a@${'😀'.repeat(HOSTILE_INPUT_SIZE / 4)}.com`],
    ['длинное имя ящика', `${'я'.repeat(HOSTILE_INPUT_SIZE / 2)}@example.com`],
    ['одни @', '@'.repeat(HOSTILE_INPUT_SIZE)],
    ['метки xn--', `a@${'xn--a.'.repeat(HOSTILE_INPUT_SIZE / 6)}com`],
  ])('враждебная строка до 100 КБ: %s', (_name, value) => {
    const start = performance.now()
    const result = emailSchema.safeParse(value)

    expect(result.success).toBe(false)
    expect(performance.now() - start).toBeLessThan(HOSTILE_INPUT_BUDGET_MS)
  })
})

describe('passwordSchema: граничные случаи', () => {
  it('пустая строка — только ошибка длины', () => {
    expect(messagesOf(passwordSchema, '')).toEqual([PASSWORD_TOO_SHORT])
  })

  it('пробелы ровно минимальной длины — повтор одного символа', () => {
    expect(messagesOf(passwordSchema, ' '.repeat(MIN_PASSWORD_LENGTH))).toEqual([PASSWORD_TOO_COMMON])
  })

  it('разные пробельные символы — не повтор, принимаются', () => {
    const password = ' \t \t'

    expect(passwordSchema.parse(password)).toBe(password)
  })

  it('популярный пароль ровно минимальной длины — ошибка списка, а не длины', () => {
    expect(messagesOf(passwordSchema, '1234')).toEqual(['Password is too common'])
  })

  it.each([
    ['пробел в конце', 'qwerty '],
    ['пробел в начале', ' qwerty'],
  ])('популярный пароль с пробелом не совпадает со списком: %s', (_name, password) => {
    expect(passwordSchema.parse(password)).toBe(password)
  })

  // Zod 4.6 считает длину строки в code points: эмодзи вне BMP — один символ, хотя в UTF-16 это два
  it('два эмодзи — 4 единицы UTF-16, но 2 символа: короче минимума', () => {
    const password = '😀😀'

    expect(password).toHaveLength(MIN_PASSWORD_LENGTH)
    expect(messagesOf(passwordSchema, password)).toEqual([PASSWORD_TOO_SHORT])
  })

  it.each([
    ['четыре разных эмодзи', distinctEmoji(MIN_PASSWORD_LENGTH)],
    ['три буквы и эмодзи', 'abc😀'],
    ['буквы вперемешку с эмодзи', 'a😀b😀'],
    ['эмодзи в начале', '😀abc'],
  ])('ровно минимум в code points: %s', (_name, password) => {
    expect(passwordSchema.parse(password)).toBe(password)
  })

  it(`${MAX_PASSWORD_LENGTH} разных эмодзи принимаются, хотя в UTF-16 это ${MAX_PASSWORD_LENGTH * 2} единиц`, () => {
    const password = distinctEmoji(MAX_PASSWORD_LENGTH)

    expect(password).toHaveLength(MAX_PASSWORD_LENGTH * 2)
    expect(passwordSchema.parse(password)).toBe(password)
  })

  it(`${MAX_PASSWORD_LENGTH + 1} разных эмодзи — длиннее максимума`, () => {
    expect(messagesOf(passwordSchema, distinctEmoji(MAX_PASSWORD_LENGTH + 1))).toEqual([PASSWORD_TOO_LONG])
  })

  it('четыре одинаковых эмодзи — повтор одного символа', () => {
    expect(messagesOf(passwordSchema, '😀'.repeat(MIN_PASSWORD_LENGTH))).toEqual([PASSWORD_TOO_COMMON])
  })

  // В UTF-8 одиночный суррогат превращается в U+FFFD: '\uD800abc' и '\uD801abc' дали бы один хэш
  it.each([
    ['одиночный старший суррогат', '\uD800abc'],
    ['одиночный младший суррогат', '\uDC00abcd'],
    ['одни суррогаты', '\uD800\uD800\uD800\uD800'],
    ['популярный пароль и суррогат', '1234\uD800'],
  ])('отклоняет некорректный UTF-16: %s', (_name, password) => {
    expect(messagesOf(passwordSchema, password)).toEqual([PASSWORD_INVALID_CHARS])
  })

  it('пара эмодзи без младшей половины — суррогат одиночный', () => {
    const password = '😀😀\uD83D'

    expect(password).toHaveLength(5)
    expect(messagesOf(passwordSchema, password)).toEqual([PASSWORD_TOO_SHORT, PASSWORD_INVALID_CHARS])
  })

  it('в ошибке некорректного UTF-16 нет введённого пароля', () => {
    const password = `${PASSWORD_SECRET}\uD800`

    expect(issuesText(passwordSchema.safeParse(password))).not.toContain(PASSWORD_SECRET)
  })

  it.each(STRING_LIKE)('%s — ошибка типа без исключения', (_name, value) => {
    expect(messagesOf(passwordSchema, value)?.[0]).toBe('Password must be a string')
  })
})

describe('emailSchema: граничные случаи', () => {
  it.each([
    ['пробелы вокруг верхнего регистра', ' A@B.CO ', 'a@b.co'],
    ['апостроф в имени', "O'Neil@Example.com", "o'neil@example.com"],
  ])('%s', (_name, input, expected) => {
    expect(emailSchema.parse(input)).toBe(expected)
  })

  it.each([
    ['перевод строки посередине', 'teacher\n@example.com'],
    ['пробел перед @', 'teacher @example.com'],
    ['пробел после @', 'teacher@ example.com'],
    ['точка в начале имени', '.teacher@example.com'],
    ['точка перед @', 'teacher.@example.com'],
    ['NUL в имени', 'tea\u0000cher@example.com'],
  ])('отклоняет: %s', (_name, value) => {
    expect(messagesOf(emailSchema, value)).toEqual(['Invalid email'])
  })

  it(`имя ящика ровно ${MAX_LOCAL_PART_LENGTH} символа принимается`, () => {
    const email = `${'a'.repeat(MAX_LOCAL_PART_LENGTH)}@example.com`

    expect(emailSchema.parse(email)).toBe(email)
  })

  it(`имя ящика ровно ${MAX_LOCAL_PART_LENGTH} символа после обрезки пробелов и смены регистра`, () => {
    const local = 'A'.repeat(MAX_LOCAL_PART_LENGTH)

    expect(emailSchema.parse(`  ${local}@Example.com \n`)).toBe(`${local.toLowerCase()}@example.com`)
  })

  // RFC 5321, 4.5.3.1.1: имя ящика не длиннее 64 октетов, почтовый сервер такой адрес не примет
  it.each([
    ['ASCII-домен', `${'a'.repeat(MAX_LOCAL_PART_LENGTH + 1)}@example.com`],
    ['кириллический домен', `${'a'.repeat(MAX_LOCAL_PART_LENGTH + 1)}@почта.рф`],
    ['с пробелами по краям', `  ${'a'.repeat(MAX_LOCAL_PART_LENGTH + 1)}@example.com  `],
    ['ещё и точка в начале — только ошибка длины', `.${'a'.repeat(MAX_LOCAL_PART_LENGTH)}@example.com`],
  ])(`имя ящика ${MAX_LOCAL_PART_LENGTH + 1} символ: %s`, (_name, value) => {
    expect(messagesOf(emailSchema, value)).toEqual([LOCAL_PART_TOO_LONG])
  })

  it('длинное имя ящика без @ — Invalid email, а не ошибка длины имени', () => {
    expect(messagesOf(emailSchema, 'a'.repeat(MAX_LOCAL_PART_LENGTH + 1))).toEqual(['Invalid email'])
  })

  it.each([
    ['точка вместо @', 'teacher.example.com'],
    ['только домен', 'example.com'],
    ['полноширинный ＠', 'teacher＠example.com'],
    ['пробел вместо @', '  teacher example.com  '],
  ])('адрес без @: %s', (_name, value) => {
    expect(messagesOf(emailSchema, value)).toEqual(['Invalid email'])
  })

  it('в ошибке длины имени ящика нет введённого значения', () => {
    const value = `${EMAIL_SECRET}${'a'.repeat(MAX_LOCAL_PART_LENGTH)}@example.com`

    expect(issuesText(emailSchema.safeParse(value))).not.toContain(EMAIL_SECRET)
  })

  it.each(STRING_LIKE)('%s — ошибка типа без исключения', (_name, value) => {
    expect(messagesOf(emailSchema, value)).toEqual(['Email must be a string'])
  })
})

describe('passwordSchema: NFC', () => {
  it.each([
    ['ü', 'b\u00fccher', 'bu\u0308cher'],
    ['й', '\u0439\u0446\u0443\u043a\u0435\u043d\u0031', '\u0438\u0306\u0446\u0443\u043a\u0435\u043d\u0031'],
    ['é и ñ', 'caf\u00e9-ma\u00f1ana', 'cafe\u0301-man\u0303ana'],
  ])('NFD и NFC дают один и тот же пароль: %s', (_name, nfc, nfd) => {
    expect(nfd).not.toBe(nfc)
    expect(passwordSchema.parse(nfd)).toBe(nfc)
    expect(passwordSchema.parse(nfc)).toBe(nfc)
  })

  it('длина считается после NFC: 4 code points в NFD становятся 3', () => {
    const password = 'aae\u0301'

    expect([...password]).toHaveLength(MIN_PASSWORD_LENGTH)
    expect(messagesOf(passwordSchema, password)).toEqual([PASSWORD_TOO_SHORT])
  })

  it.each([
    ['contraseña', 'contrasen\u0303a'],
    ['йцукен в верхнем регистре', '\u0418\u0306\u0426\u0423\u041a\u0415\u041d'],
  ])('популярный пароль в NFD ловится списком: %s', (_name, password) => {
    expect(password.normalize('NFC')).not.toBe(password)
    expect(messagesOf(passwordSchema, password)).toEqual([PASSWORD_TOO_COMMON])
  })
})

describe('passwordSchema: простые пароли', () => {
  it.each([
    // Повтор одного символа
    '0000', 'aaaa', 'AAAA', 'aAaA', '7777', 'zzzzzzzzzzzz',
    // Последовательности в обе стороны, в том числе через 0
    'abcd', 'DCBA', '1234', '4321', '7890', '0987', 'wxyz', '0123456789', 'abcdefghijklmnopqrstuvwxyz',
    // PIN и клавиатурные шаблоны
    '1212', 'qwer', 'QWER', 'asdf', '1q2w', 'йцукен',
    // «Пароль» на разных языках
    'пароль', 'ПАРОЛЬ', 'Пароль123', 'passwort', 'PassWort',
  ])('%j — Password is too common', (password) => {
    expect(messagesOf(passwordSchema, password)).toEqual([PASSWORD_TOO_COMMON])
  })

  it.each([
    ['пропуск в последовательности', 'abce'],
    ['последняя цифра не по порядку', '1235'],
    ['буквы и цифры', 'ab12'],
    ['последовательность с повтором', 'aabc'],
    ['алфавит по кругу', 'yzab'],
    ['цифры по кругу без 0', '9012'],
    ['популярный пароль с пробелом в начале', ' qwerty'],
    ['кириллица по алфавиту: правило только для латиницы и цифр', 'абвг'],
  ])('принимает: %s', (_name, password) => {
    expect(passwordSchema.parse(password)).toBe(password)
  })

  it.each([
    ['повтор короче минимума', 'x'.repeat(MIN_PASSWORD_LENGTH - 1), PASSWORD_TOO_SHORT],
    ['последовательность короче минимума', 'abc', PASSWORD_TOO_SHORT],
    ['повтор длиннее максимума', 'x'.repeat(MAX_PASSWORD_LENGTH + 1), PASSWORD_TOO_LONG],
  ])('простой пароль с ошибкой длины — только ошибка длины: %s', (_name, password, message) => {
    expect(messagesOf(passwordSchema, password)).toEqual([message])
  })
})

describe('emailSchema: невидимые символы и другие точки в домене', () => {
  it.each([
    ['мягкий перенос U+00AD', 'a@ex\u00adample.com'],
    ['ZWSP U+200B', 'a@ex\u200bample.com'],
    ['ZWSP в конце', 'a@example.com\u200b'],
    ['ZWNJ U+200C', 'a@ex\u200cample.com'],
    ['word joiner U+2060', 'a@ex\u2060ample.com'],
    ['CGJ U+034F', 'a@ex\u034fample.com'],
    ['селектор варианта U+FE00', 'a@ex\ufe00ample.com'],
    ['селектор варианта U+FE0F', 'a@ex\ufe0fample.com'],
    ['идеографическая точка U+3002', 'a@example\u3002com'],
    ['полноширинная точка U+FF0E', 'a@example\uff0ecom'],
    ['полуширинная точка U+FF61', 'a@example\uff61com'],
  ])('%s — Invalid email', (_name, value) => {
    expect(messagesOf(emailSchema, value)).toEqual(['Invalid email'])
  })

  it.each([
    ['полноширинные буквы', 'a@\uff25\uff38\uff21\uff2d\uff30\uff2c\uff25.\uff43\uff4f\uff4d', 'a@example.com'],
    // trim() в JS считает BOM пробелом, а U+200B — нет
    ['BOM по краям обрезается как пробел', '\ufeffa@example.com\ufeff', 'a@example.com'],
    ['bücher.de в NFC', 'a@b\u00fccher.de', 'a@xn--bcher-kva.de'],
    ['bücher.de в NFD: комбинирующий знак — не невидимый символ', 'a@bu\u0308cher.de', 'a@xn--bcher-kva.de'],
  ])('принимает: %s', (_name, input, expected) => {
    expect(emailSchema.parse(input)).toBe(expected)
  })
})
