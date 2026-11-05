import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = fileURLToPath(new URL('../prisma/migrations', import.meta.url))

// Prisma не описывает CHECK в схеме: при пересоздании миграций они пропадут молча
const MANUAL_CHECKS = [
  ['teachers', 'teachers_email_lowercase_check', 'CHECK ("email" = lower("email"))'],
  ['teachers', 'teachers_login_method_check', 'CHECK ("password_hash" IS NOT NULL OR "google_id" IS NOT NULL)'],
  ['teachers', 'teachers_email_not_empty_check', `CHECK ("email" <> '')`],
  ['teachers', 'teachers_email_trimmed_check', String.raw`CHECK ("email" = btrim("email", E' \t\r\n'))`],
  ['teachers', 'teachers_password_hash_not_empty_check', `CHECK ("password_hash" <> '')`],
  ['teachers', 'teachers_google_id_not_empty_check', `CHECK ("google_id" <> '')`],
  ['teachers', 'teachers_display_name_length_check', 'CHECK (char_length("display_name") BETWEEN 1 AND 100)'],
  ['teachers', 'teachers_display_name_trimmed_check', String.raw`CHECK ("display_name" = btrim("display_name", E' \t\r\n'))`],
  ['teachers', 'teachers_password_hash_argon2id_check', `CHECK ("password_hash" LIKE '$argon2id$%')`],
  ['teachers', 'teachers_display_name_no_control_chars_check', String.raw`CHECK ("display_name" !~ '[\x01-\x1f\x7f-\x9f]')`],
  ['refresh_tokens', 'refresh_tokens_token_hash_format_check', `CHECK ("token_hash" ~ '^[0-9a-f]{64}$')`],
  ['refresh_tokens', 'refresh_tokens_expires_after_created_check', 'CHECK ("expires_at" > "created_at")'],
  ['refresh_tokens', 'refresh_tokens_expires_within_family_check', 'CHECK ("expires_at" <= "family_expires_at")'],
  ['pending_registrations', 'pending_registrations_email_lowercase_check', 'CHECK ("email" = lower("email"))'],
  ['pending_registrations', 'pending_registrations_email_not_empty_check', `CHECK ("email" <> '')`],
  [
    'pending_registrations',
    'pending_registrations_email_trimmed_check',
    String.raw`CHECK ("email" = btrim("email", E' \t\r\n'))`,
  ],
  [
    'pending_registrations',
    'pending_registrations_password_hash_argon2id_check',
    `CHECK ("password_hash" LIKE '$argon2id$%')`,
  ],
  ['pending_registrations', 'pending_registrations_token_hash_format_check', `CHECK ("token_hash" ~ '^[0-9a-f]{64}$')`],
  ['pending_registrations', 'pending_registrations_expires_after_created_check', 'CHECK ("expires_at" > "created_at")'],
]
// Без каскада удаление учителя оставило бы его сессии в базе (GDPR)
const REFRESH_TOKENS_CASCADE =
  'ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE'

function readAllMigrations(): string {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(join(MIGRATIONS_DIR, entry.name, 'migration.sql'), 'utf8'))
    .join('\n')
    // Закомментированный CHECK не применяется: комментарии убираются до сравнения
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
}

describe('миграции', () => {
  it.each(MANUAL_CHECKS)('%s: содержат ручной CHECK %s', (table, name, check) => {
    expect(readAllMigrations()).toContain(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${check};`)
  })

  it('имена ручных CHECK не повторяются', () => {
    const names = MANUAL_CHECKS.map(([, name]) => name)

    expect(new Set(names).size).toBe(names.length)
  })

  // Новый CHECK без строки в списке остался бы без защиты от пересоздания миграций
  it('все CHECK из миграций перечислены в списке', () => {
    const inMigrations = [...readAllMigrations().matchAll(/ADD CONSTRAINT "([^"]+)" CHECK/g)].map((match) => match[1])

    expect(inMigrations.sort()).toEqual(MANUAL_CHECKS.map(([, name]) => name).sort())
  })

  it('refresh-токены удаляются вместе с учителем', () => {
    expect(readAllMigrations()).toContain(REFRESH_TOKENS_CASCADE)
  })
})
