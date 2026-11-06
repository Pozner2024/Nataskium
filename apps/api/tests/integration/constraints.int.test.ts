import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { createTestPrisma, truncateAll } from './testDatabase'

// Ограничения базы — второй рубеж после Zod: проверяются напрямую через SQL, в обход схем.
// Управляющие и невидимые символы задаются через chr(), чтобы в файле не было скрытых символов
const TEACHER_ID = '00000000-0000-0000-0000-0000000000a1'
const MISSING_TEACHER_ID = '00000000-0000-0000-0000-0000000000ff'
const TEACHER_EMAIL = 'qa-teacher@example.test'
const ARGON2ID_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'
const SEEDED_TOKEN_HASH = 'a'.repeat(64)
const SEEDED_PENDING_TOKEN_HASH = '1'.repeat(64)

let prisma: PrismaClient

function setDisplayName(expression: string): string {
  return `UPDATE teachers SET display_name = ${expression} WHERE id = '${TEACHER_ID}'`
}

function insertTeacher(columns: { email?: string; passwordHash?: string | null; googleId?: string | null }): string {
  const { email = "'qa-new@example.test'", passwordHash = `'${ARGON2ID_HASH}'`, googleId = null } = columns
  return `INSERT INTO teachers (id, email, password_hash, google_id, updated_at)
    VALUES (gen_random_uuid(), ${email}, ${passwordHash ?? 'NULL'}, ${googleId ?? 'NULL'}, now())`
}

function insertToken(columns: { tokenHash?: string; expiresAt?: string; familyExpiresAt?: string; teacherId?: string; createdAt?: string }): string {
  const {
    tokenHash = `'${'c'.repeat(64)}'`,
    expiresAt = "now() + interval '14 days'",
    familyExpiresAt = "now() + interval '30 days'",
    teacherId = TEACHER_ID,
    createdAt = 'now()',
  } = columns
  return `INSERT INTO refresh_tokens (id, teacher_id, family_id, family_expires_at, token_hash, expires_at, created_at)
    VALUES (gen_random_uuid(), '${teacherId}', gen_random_uuid(), ${familyExpiresAt}, ${tokenHash}, ${expiresAt}, ${createdAt})`
}

function insertPending(columns: {
  email?: string
  passwordHash?: string
  tokenHash?: string
  expiresAt?: string
  displayName?: string
}): string {
  const {
    displayName = 'NULL',
    email = "'qa-pending@example.test'",
    passwordHash = `'${ARGON2ID_HASH}'`,
    tokenHash = `'${'2'.repeat(64)}'`,
    expiresAt = "now() + interval '1 day'",
  } = columns
  return `INSERT INTO pending_registrations (id, email, password_hash, token_hash, expires_at, display_name)
    VALUES (gen_random_uuid(), ${email}, ${passwordHash}, ${tokenHash}, ${expiresAt}, ${displayName})`
}

// Имя ограничения есть только в тексте ошибки драйвера: 'violates check constraint "name"'
function constraintOf(error: unknown): string {
  const text = error instanceof Error ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? null)}` : String(error)
  return /constraint \\"([^\\"]+)\\"/.exec(text)?.[1] ?? `no constraint in: ${text.slice(0, 300)}`
}

async function violatedConstraint(sql: string): Promise<string> {
  try {
    await prisma.$executeRawUnsafe(sql)
  } catch (error) {
    return constraintOf(error)
  }
  return 'accepted'
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})

beforeEach(async () => {
  await truncateAll(prisma)
  await prisma.$executeRawUnsafe(insertTeacher({ email: `'${TEACHER_EMAIL}'` }).replace('gen_random_uuid()', `'${TEACHER_ID}'`))
  await prisma.$executeRawUnsafe(insertToken({ tokenHash: `'${SEEDED_TOKEN_HASH}'` }))
  await prisma.$executeRawUnsafe(insertPending({ tokenHash: `'${SEEDED_PENDING_TOKEN_HASH}'` }))
})

afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('teachers: допустимые значения', () => {
  it.each([
    ['учитель только с google_id', insertTeacher({ passwordHash: null, googleId: "'google-sub-1'" })],
    ['display_name NULL', setDisplayName('NULL')],
    ['display_name из 1 символа', setDisplayName("'А'")],
    ['display_name из 100 букв кириллицей', setDisplayName("repeat('я', 100)")],
    ['display_name из 100 эмодзи: длина в code points', setDisplayName("repeat('😀', 100)")],
    ['display_name с пробелом внутри', setDisplayName("'Анна Ли'")],
    ['display_name с NBSP внутри: не Cc', setDisplayName("'Анна' || chr(160) || 'Ли'")],
    ['display_name с апострофом, тире и эмодзи', setDisplayName("'O''Neil – учитель 😀'")],
  ])('%s', async (_name, sql) => {
    await expect(prisma.$executeRawUnsafe(sql)).resolves.toBe(1)
  })
})

describe('teachers: отклоняемые значения', () => {
  it.each([
    ['пароль открытым текстом', insertTeacher({ passwordHash: "'plain-password'" }), 'teachers_password_hash_argon2id_check'],
    ['$argon2i$', insertTeacher({ passwordHash: "'$argon2i$v=19$x'" }), 'teachers_password_hash_argon2id_check'],
    ['$argon2d$', insertTeacher({ passwordHash: "'$argon2d$v=19$x'" }), 'teachers_password_hash_argon2id_check'],
    ['bcrypt $2b$', insertTeacher({ passwordHash: "'$2b$12$abcdefghijklmnopqrstuv'" }), 'teachers_password_hash_argon2id_check'],
    ['$ARGON2ID$ в верхнем регистре', insertTeacher({ passwordHash: "'$ARGON2ID$v=19$x'" }), 'teachers_password_hash_argon2id_check'],
    ['пробел перед $argon2id$', insertTeacher({ passwordHash: "' $argon2id$v=19$x'" }), 'teachers_password_hash_argon2id_check'],
    [
      'смена пароля на открытый текст',
      `UPDATE teachers SET password_hash = 'new-plain' WHERE id = '${TEACHER_ID}'`,
      'teachers_password_hash_argon2id_check',
    ],
    ['нет ни пароля, ни Google', insertTeacher({ passwordHash: null }), 'teachers_login_method_check'],
    ['email в верхнем регистре', insertTeacher({ email: "'QA1@example.test'" }), 'teachers_email_lowercase_check'],
    ['email с пробелом в начале', insertTeacher({ email: "' qa1@example.test'" }), 'teachers_email_trimmed_check'],
    ['email с табуляцией в конце', insertTeacher({ email: "'qa1@example.test' || chr(9)" }), 'teachers_email_trimmed_check'],
    ['пустой email', insertTeacher({ email: "''" }), 'teachers_email_not_empty_check'],
    ['повтор email', insertTeacher({ email: `'${TEACHER_EMAIL}'` }), 'teachers_email_key'],
    ['display_name пустой', setDisplayName("''"), 'teachers_display_name_length_check'],
    ['display_name 101 латиницей', setDisplayName("repeat('a', 101)"), 'teachers_display_name_length_check'],
    ['display_name 101 кириллицей', setDisplayName("repeat('я', 101)"), 'teachers_display_name_length_check'],
    ['display_name 101 эмодзи', setDisplayName("repeat('😀', 101)"), 'teachers_display_name_length_check'],
    ['display_name с пробелом в начале', setDisplayName("' Анна'"), 'teachers_display_name_trimmed_check'],
    ['display_name с пробелом в конце', setDisplayName("'Анна '"), 'teachers_display_name_trimmed_check'],
    ['display_name из одного пробела', setDisplayName("' '"), 'teachers_display_name_trimmed_check'],
  ])('%s', async (_name, sql, constraint) => {
    expect(await violatedConstraint(sql)).toBe(constraint)
  })

  it('пустой password_hash: срабатывает одна из двух проверок', async () => {
    expect(['teachers_password_hash_argon2id_check', 'teachers_password_hash_not_empty_check']).toContain(
      await violatedConstraint(insertTeacher({ passwordHash: "''" })),
    )
  })

  it('display_name с переводом строки в конце: срабатывает одна из двух проверок', async () => {
    expect(['teachers_display_name_trimmed_check', 'teachers_display_name_no_control_chars_check']).toContain(
      await violatedConstraint(setDisplayName("'Анна' || chr(10)")),
    )
  })

  // Категория Cc целиком, без U+0000: в text его не бывает
  it.each([
    ['U+0001', 1],
    ['табуляция', 9],
    ['перевод строки', 10],
    ['возврат каретки', 13],
    ['ESC', 27],
    ['U+001F', 31],
    ['DEL', 127],
    ['NEL U+0085', 133],
    ['U+009F', 159],
  ])('управляющий символ внутри display_name: %s', async (_name, code) => {
    expect(await violatedConstraint(setDisplayName(`'Анна' || chr(${code}) || 'Ли'`))).toBe(
      'teachers_display_name_no_control_chars_check',
    )
  })
})

describe('refresh_tokens', () => {
  it.each([
    ['корректный токен', insertToken({})],
    ['срок ровно равен сроку семьи', insertToken({ expiresAt: "now() + interval '30 days'" })],
  ])('принимает: %s', async (_name, sql) => {
    await expect(prisma.$executeRawUnsafe(sql)).resolves.toBe(1)
  })

  it.each([
    ['сырой токен base64url', insertToken({ tokenHash: "'dGhpcy1pcy1hLXJhdy1yZWZyZXNoLXRva2VuLWJhc2U2NHVybC1lbmNvZGVkLXh4eA'" }), 'refresh_tokens_token_hash_format_check'],
    ['hex в верхнем регистре', insertToken({ tokenHash: "repeat('A', 64)" }), 'refresh_tokens_token_hash_format_check'],
    ['hex из 63 символов', insertToken({ tokenHash: "repeat('c', 63)" }), 'refresh_tokens_token_hash_format_check'],
    ['hex из 65 символов', insertToken({ tokenHash: "repeat('c', 65)" }), 'refresh_tokens_token_hash_format_check'],
    ['hex с переводом строки в конце', insertToken({ tokenHash: "repeat('c', 64) || chr(10)" }), 'refresh_tokens_token_hash_format_check'],
    ['повтор token_hash', insertToken({ tokenHash: `'${SEEDED_TOKEN_HASH}'` }), 'refresh_tokens_token_hash_key'],
    ['срок раньше создания', insertToken({ expiresAt: "now() - interval '1 second'" }), 'refresh_tokens_expires_after_created_check'],
    ['срок равен созданию', insertToken({ expiresAt: 'now()' }), 'refresh_tokens_expires_after_created_check'],
    ['срок дальше срока семьи', insertToken({ familyExpiresAt: "now() + interval '10 days'" }), 'refresh_tokens_expires_within_family_check'],
    [
      'ротация продлевает срок за срок семьи',
      `UPDATE refresh_tokens SET expires_at = family_expires_at + interval '1 second' WHERE token_hash = '${SEEDED_TOKEN_HASH}'`,
      'refresh_tokens_expires_within_family_check',
    ],
    ['несуществующий учитель', insertToken({ teacherId: MISSING_TEACHER_ID }), 'refresh_tokens_teacher_id_fkey'],
  ])('%s', async (_name, sql, constraint) => {
    expect(await violatedConstraint(sql)).toBe(constraint)
  })

  it('удаление учителя удаляет все его токены', async () => {
    await prisma.$executeRawUnsafe(insertToken({}))
    expect(await prisma.refreshToken.count({ where: { teacherId: TEACHER_ID } })).toBe(2)

    await prisma.$executeRawUnsafe(`DELETE FROM teachers WHERE id = '${TEACHER_ID}'`)

    expect(await prisma.refreshToken.count({ where: { teacherId: TEACHER_ID } })).toBe(0)
  })

  it('удаление учителя не трогает заявки на регистрацию с тем же email', async () => {
    await prisma.$executeRawUnsafe(insertPending({ email: `'${TEACHER_EMAIL}'` }))

    await prisma.$executeRawUnsafe(`DELETE FROM teachers WHERE id = '${TEACHER_ID}'`)

    expect(await prisma.pendingRegistration.count({ where: { email: TEACHER_EMAIL } })).toBe(1)
  })
})

describe('pending_registrations', () => {
  it.each([
    ['вторая заявка с тем же email', insertPending({ passwordHash: "'$argon2id$v=19$y'" })],
    ['заявка с email существующего учителя', insertPending({ email: `'${TEACHER_EMAIL}'` })],
  ])('принимает: %s', async (_name, sql) => {
    await expect(prisma.$executeRawUnsafe(sql)).resolves.toBe(1)
  })

  it('две заявки с одним email хранятся обе', async () => {
    await prisma.$executeRawUnsafe(insertPending({}))

    expect(await prisma.pendingRegistration.count({ where: { email: 'qa-pending@example.test' } })).toBe(2)
  })

  it.each([
    ['email в верхнем регистре', insertPending({ email: "'QA-Pending@example.test'" }), 'pending_registrations_email_lowercase_check'],
    ['email с пробелом в начале', insertPending({ email: "' qa-pending@example.test'" }), 'pending_registrations_email_trimmed_check'],
    ['email с \\r\\n в конце', insertPending({ email: "'qa-pending@example.test' || chr(13) || chr(10)" }), 'pending_registrations_email_trimmed_check'],
    ['пустой email', insertPending({ email: "''" }), 'pending_registrations_email_not_empty_check'],
    ['пароль открытым текстом', insertPending({ passwordHash: "'plain-password'" }), 'pending_registrations_password_hash_argon2id_check'],
    ['$argon2i$', insertPending({ passwordHash: "'$argon2i$v=19$x'" }), 'pending_registrations_password_hash_argon2id_check'],
    ['сырой токен', insertPending({ tokenHash: "'raw-token-base64url'" }), 'pending_registrations_token_hash_format_check'],
    ['повтор token_hash', insertPending({ tokenHash: `'${SEEDED_PENDING_TOKEN_HASH}'` }), 'pending_registrations_token_hash_key'],
    ['срок раньше создания', insertPending({ expiresAt: "now() - interval '1 second'" }), 'pending_registrations_expires_after_created_check'],
  ])('%s', async (_name, sql, constraint) => {
    expect(await violatedConstraint(sql)).toBe(constraint)
  })
})

describe('схема базы', () => {
  it.each(['refresh_tokens_expires_at_idx', 'refresh_tokens_teacher_id_idx', 'refresh_tokens_family_id_idx'])(
    'есть индекс %s',
    async (name) => {
      const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT indexname AS name FROM pg_indexes WHERE indexname = ${name}`

      expect(rows).toHaveLength(1)
    },
  )

  it('индекс email в pending_registrations не уникальный', async () => {
    const [row] = await prisma.$queryRaw<{ def: string }[]>`SELECT indexdef AS def FROM pg_indexes WHERE indexname = 'pending_registrations_email_idx'`

    expect(row?.def).not.toContain('UNIQUE')
  })

  it('в базе 22 CHECK на таблицах приложения', async () => {
    const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM pg_constraint
      WHERE contype = 'c' AND conrelid IN ('teachers'::regclass, 'refresh_tokens'::regclass, 'pending_registrations'::regclass)`

    expect(Number(row?.count)).toBe(22)
  })
})

// Те же CHECK, что у teachers.display_name: имя переносится в teachers при подтверждении email
describe('pending_registrations.display_name', () => {
  it.each([
    ['NULL', 'NULL'],
    ['1 символ', "'А'"],
    ['100 букв кириллицей', "repeat('я', 100)"],
    ['100 эмодзи', "repeat('😀', 100)"],
    ['NBSP внутри', "'Анна' || chr(160) || 'Ли'"],
  ])('принимает: %s', async (_name, displayName) => {
    await expect(prisma.$executeRawUnsafe(insertPending({ displayName }))).resolves.toBe(1)
  })

  it.each([
    ['пустое', "''", 'pending_registrations_display_name_length_check'],
    ['101 кириллицей', "repeat('я', 101)", 'pending_registrations_display_name_length_check'],
    ['101 эмодзи', "repeat('😀', 101)", 'pending_registrations_display_name_length_check'],
    ['пробел в начале', "' Анна'", 'pending_registrations_display_name_trimmed_check'],
    ['пробел в конце', "'Анна '", 'pending_registrations_display_name_trimmed_check'],
    ['табуляция внутри', "'Анна' || chr(9) || 'Ли'", 'pending_registrations_display_name_no_control_chars_check'],
    ['ESC внутри', "chr(27) || '[31mАнна'", 'pending_registrations_display_name_no_control_chars_check'],
    ['DEL внутри', "'Анна' || chr(127) || 'Ли'", 'pending_registrations_display_name_no_control_chars_check'],
    ['NEL U+0085 внутри', "'Анна' || chr(133) || 'Ли'", 'pending_registrations_display_name_no_control_chars_check'],
  ])('%s', async (_name, displayName, constraint) => {
    expect(await violatedConstraint(insertPending({ displayName }))).toBe(constraint)
  })
})

describe('password_resets', () => {
  function insertReset(columns: { tokenHash?: string; expiresAt?: string; teacherId?: string }) {
    const { tokenHash = `'${'e'.repeat(64)}'`, expiresAt = "now() + interval '1 hour'", teacherId = TEACHER_ID } = columns
    return `INSERT INTO password_resets (id, teacher_id, token_hash, expires_at) VALUES (gen_random_uuid(), '${teacherId}', ${tokenHash}, ${expiresAt})`
  }

  it('корректная ссылка принимается', async () => {
    await expect(prisma.$executeRawUnsafe(insertReset({}))).resolves.toBe(1)
  })

  it.each([
    ['сырой токен', insertReset({ tokenHash: "'raw-reset-token-base64url'" }), 'password_resets_token_hash_format_check'],
    ['hex в верхнем регистре', insertReset({ tokenHash: "repeat('E', 64)" }), 'password_resets_token_hash_format_check'],
    ['срок раньше создания', insertReset({ expiresAt: "now() - interval '1 second'" }), 'password_resets_expires_after_created_check'],
    ['несуществующий учитель', insertReset({ teacherId: MISSING_TEACHER_ID }), 'password_resets_teacher_id_fkey'],
  ])('%s', async (_name, sql, constraint) => {
    expect(await violatedConstraint(sql)).toBe(constraint)
  })

  it('повтор token_hash — unique', async () => {
    await prisma.$executeRawUnsafe(insertReset({}))

    expect(await violatedConstraint(insertReset({}))).toBe('password_resets_token_hash_key')
  })
})

describe('pending_google_links', () => {
  function insertLink(columns: { tokenHash?: string; expiresAt?: string; googleId?: string; teacherId?: string; secretHash?: string }) {
    const {
      secretHash = `'${'d'.repeat(64)}'`,
      tokenHash = `'${'f'.repeat(64)}'`,
      expiresAt = "now() + interval '10 minutes'",
      googleId = "'google-sub-1'",
      teacherId = TEACHER_ID,
    } = columns
    return `INSERT INTO pending_google_links (id, teacher_id, google_id, token_hash, link_secret_hash, expires_at)
      VALUES (gen_random_uuid(), '${teacherId}', ${googleId}, ${tokenHash}, ${secretHash}, ${expiresAt})`
  }

  it('корректная привязка принимается', async () => {
    await expect(prisma.$executeRawUnsafe(insertLink({}))).resolves.toBe(1)
  })

  it.each([
    ['сырой токен', insertLink({ tokenHash: "'raw-link-token-base64url'" }), 'pending_google_links_token_hash_format_check'],
    ['срок раньше создания', insertLink({ expiresAt: "now() - interval '1 second'" }), 'pending_google_links_expires_after_created_check'],
    ['пустой google_id', insertLink({ googleId: "''" }), 'pending_google_links_google_id_not_empty_check'],
    ['сырой секрет cookie', insertLink({ secretHash: "'raw-link-secret-base64url'" }), 'pending_google_links_link_secret_hash_format_check'],
    ['секрет в верхнем регистре', insertLink({ secretHash: "repeat('D', 64)" }), 'pending_google_links_link_secret_hash_format_check'],
    ['несуществующий учитель', insertLink({ teacherId: MISSING_TEACHER_ID }), 'pending_google_links_teacher_id_fkey'],
  ])('%s', async (_name, sql, constraint) => {
    expect(await violatedConstraint(sql)).toBe(constraint)
  })

  it('вторая привязка тому же учителю — unique по teacher_id', async () => {
    await prisma.$executeRawUnsafe(insertLink({}))

    expect(await violatedConstraint(insertLink({ tokenHash: `'${'0'.repeat(64)}'` }))).toBe('pending_google_links_teacher_id_key')
  })
})
