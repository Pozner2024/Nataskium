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
  ['password_resets', 'password_resets_token_hash_format_check', `CHECK ("token_hash" ~ '^[0-9a-f]{64}$')`],
  ['password_resets', 'password_resets_expires_after_created_check', 'CHECK ("expires_at" > "created_at")'],
  ['pending_google_links', 'pending_google_links_token_hash_format_check', `CHECK ("token_hash" ~ '^[0-9a-f]{64}$')`],
  ['pending_google_links', 'pending_google_links_expires_after_created_check', 'CHECK ("expires_at" > "created_at")'],
  ['pending_google_links', 'pending_google_links_google_id_not_empty_check', `CHECK ("google_id" <> '')`],
  ['pending_google_links', 'pending_google_links_link_secret_hash_format_check', `CHECK ("link_secret_hash" ~ '^[0-9a-f]{64}$')`],
  ['pending_registrations', 'pending_registrations_display_name_length_check', 'CHECK (char_length("display_name") BETWEEN 1 AND 100)'],
  [
    'pending_registrations',
    'pending_registrations_display_name_trimmed_check',
    String.raw`CHECK ("display_name" = btrim("display_name", E' \t\r\n'))`,
  ],
  [
    'pending_registrations',
    'pending_registrations_display_name_no_control_chars_check',
    String.raw`CHECK ("display_name" !~ '[\x01-\x1f\x7f-\x9f]')`,
  ],
  ['pending_google_reauths', 'pending_google_reauths_state_hash_format_check', `CHECK ("state_hash" ~ '^[0-9a-f]{64}$')`],
  ['pending_google_reauths', 'pending_google_reauths_expires_after_created_check', 'CHECK ("expires_at" > "created_at")'],
  ['quizzes', 'quizzes_grading_scale_check', `CHECK ("grading_scale" IN ('ten', 'five', 'letter'))`],
  ['quizzes', 'quizzes_title_not_empty_check', `CHECK ("title" <> '')`],
  ['quizzes', 'quizzes_share_token_not_empty_check', `CHECK ("share_token" <> '')`],
  ['quizzes', 'quizzes_timer_mode_check', `CHECK ("timer_mode" IN ('none', 'stopwatch', 'limit'))`],
  // IS NOT NULL в ветке limit обязателен: без него (limit, NULL) проходит CHECK
  [
    'quizzes',
    'quizzes_time_limit_check',
    `CHECK ( ("timer_mode" = 'limit' AND "time_limit_seconds" IS NOT NULL AND "time_limit_seconds" BETWEEN 60 AND 10800) OR ("timer_mode" <> 'limit' AND "time_limit_seconds" IS NULL) )`,
  ],
  ['quizzes', 'quizzes_type_check', `CHECK ("type" IN ('quiz', 'matching', 'truefalse'))`],
  // CASE обязателен: в AND jsonb_array_length на не-массиве может вычислиться первым и бросить ошибку
  [
    'quizzes',
    'quizzes_matching_pairs_check',
    `CHECK ( "type" <> 'matching' OR CASE WHEN jsonb_typeof("questions") = 'array' THEN jsonb_array_length("questions") BETWEEN 2 AND 10 ELSE false END )`,
  ],
  [
    'quizzes',
    'quizzes_truefalse_items_check',
    `CHECK ( "type" <> 'truefalse' OR CASE WHEN jsonb_typeof("questions") = 'array' THEN jsonb_array_length("questions") BETWEEN 2 AND 30 ELSE false END )`,
  ],
  ['library_groups', 'library_groups_slug_format_check', `CHECK ("slug" ~ '^[a-z][a-z0-9-]{1,39}$' AND "slug" <> 'quiz')`],
  [
    'library_groups',
    'library_groups_names_check',
    `CHECK ( jsonb_typeof("names") = 'object' AND "names" ?& ARRAY['ru', 'en', 'de', 'fr'] AND btrim("names" ->> 'ru') <> '' AND btrim("names" ->> 'en') <> '' AND btrim("names" ->> 'de') <> '' AND btrim("names" ->> 'fr') <> '' )`,
  ],
]
// Без каскада удаление учителя оставило бы его сессии в базе (GDPR)
const PASSWORD_RESETS_CASCADE =
  'ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE'
// Одна ссылка сброса на учителя: replaceForTeacher — upsert по этому индексу
const PASSWORD_RESETS_UNIQUE_TEACHER = 'CREATE UNIQUE INDEX "password_resets_teacher_id_key" ON "password_resets"("teacher_id");'
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
    // Set: quizzes_type_check пересоздаётся последующими миграциями, имя встречается несколько раз
    const inMigrations = [...new Set([...readAllMigrations().matchAll(/ADD CONSTRAINT "([^"]+)" CHECK/g)].map((match) => match[1]))]

    expect(inMigrations.sort()).toEqual(MANUAL_CHECKS.map(([, name]) => name).sort())
  })

  it('ссылка сброса — не больше одной на учителя: уникальный индекс по teacher_id', () => {
    expect(readAllMigrations()).toContain(PASSWORD_RESETS_UNIQUE_TEACHER)
  })

  it('неуникальный индекс по teacher_id удалён: его заменил уникальный', () => {
    expect(readAllMigrations()).toContain('DROP INDEX "password_resets_teacher_id_idx";')
  })

  it('незавершённая привязка Google — одна на учителя и удаляется вместе с ним', () => {
    expect(readAllMigrations()).toContain('CREATE UNIQUE INDEX "pending_google_links_teacher_id_key" ON "pending_google_links"("teacher_id");')
    expect(readAllMigrations()).toContain(
      'ALTER TABLE "pending_google_links" ADD CONSTRAINT "pending_google_links_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE',
    )
  })

  it('ссылки сброса пароля удаляются вместе с учителем', () => {
    expect(readAllMigrations()).toContain(PASSWORD_RESETS_CASCADE)
  })

  // Подтверждение удаления через Google: одна запись на учителя, хранится только HMAC состояния, удаляется с учителем
  it('подтверждение удаления через Google — одна запись на учителя, каскад и уникальный state_hash', () => {
    expect(readAllMigrations()).toContain('CREATE UNIQUE INDEX "pending_google_reauths_teacher_id_key" ON "pending_google_reauths"("teacher_id");')
    expect(readAllMigrations()).toContain('CREATE UNIQUE INDEX "pending_google_reauths_state_hash_key" ON "pending_google_reauths"("state_hash");')
    expect(readAllMigrations()).toContain(
      'ALTER TABLE "pending_google_reauths" ADD CONSTRAINT "pending_google_reauths_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    )
  })

  // GDPR: строки картинок удаляются с учителем; при удалении викторины картинка становится «осиротевшей»
  it('картинки викторин: каскад от учителя, SET NULL от викторины, индексы по FK', () => {
    const migrations = readAllMigrations()
    expect(migrations).toContain(
      'ALTER TABLE "quiz_images" ADD CONSTRAINT "quiz_images_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE',
    )
    expect(migrations).toContain(
      'ALTER TABLE "quiz_images" ADD CONSTRAINT "quiz_images_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE SET NULL',
    )
    expect(migrations).toContain('CREATE INDEX "quiz_images_teacher_id_idx" ON "quiz_images"("teacher_id");')
    expect(migrations).toContain('CREATE INDEX "quiz_images_quiz_id_idx" ON "quiz_images"("quiz_id");')
    expect(migrations).toContain('CREATE INDEX "quiz_images_quiz_id_created_at_idx" ON "quiz_images"("quiz_id", "created_at");')
  })

  it('refresh-токены удаляются вместе с учителем', () => {
    expect(readAllMigrations()).toContain(REFRESH_TOKENS_CASCADE)
  })
})
