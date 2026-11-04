import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = fileURLToPath(new URL('../prisma/migrations', import.meta.url))

// Prisma не описывает CHECK в схеме: при пересоздании миграций они пропадут молча
const MANUAL_CHECKS = [
  ['teachers_email_lowercase_check', 'CHECK ("email" = lower("email"))'],
  ['teachers_login_method_check', 'CHECK ("password_hash" IS NOT NULL OR "google_id" IS NOT NULL)'],
  ['teachers_email_not_empty_check', `CHECK ("email" <> '')`],
  ['teachers_email_trimmed_check', String.raw`CHECK ("email" = btrim("email", E' \t\r\n'))`],
  ['teachers_password_hash_not_empty_check', `CHECK ("password_hash" <> '')`],
  ['teachers_google_id_not_empty_check', `CHECK ("google_id" <> '')`],
]

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
  it.each(MANUAL_CHECKS)('содержат ручной CHECK %s', (name, check) => {
    expect(readAllMigrations()).toContain(`ALTER TABLE "teachers" ADD CONSTRAINT "${name}" ${check};`)
  })
})
