-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "display_name" TEXT;

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "family_expires_at" TIMESTAMPTZ NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_registrations" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_teacher_id_idx" ON "refresh_tokens"("teacher_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_registrations_token_hash_key" ON "pending_registrations"("token_hash");

-- CreateIndex
CREATE INDEX "pending_registrations_email_idx" ON "pending_registrations"("email");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Добавлено вручную: Prisma не описывает CHECK в схеме
-- display_name: NULL допустим; 100 — DISPLAY_NAME_MAX_LENGTH из packages/shared, длина в code points, как в Zod
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_display_name_length_check" CHECK (char_length("display_name") BETWEEN 1 AND 100);
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_display_name_trimmed_check" CHECK ("display_name" = btrim("display_name", E' \t\r\n'));

-- В token_hash только HMAC-SHA256 в hex: сырой токен (base64url) сюда не запишется
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_expires_after_created_check" CHECK ("expires_at" > "created_at");
-- Ротация не продлевает сессию дальше абсолютного срока семьи
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_expires_within_family_check" CHECK ("expires_at" <= "family_expires_at");

ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_email_lowercase_check" CHECK ("email" = lower("email"));
ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_email_not_empty_check" CHECK ("email" <> '');
ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_email_trimmed_check" CHECK ("email" = btrim("email", E' \t\r\n'));
-- Только хэш argon2id: пароль в открытом виде сюда не запишется
ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_password_hash_argon2id_check" CHECK ("password_hash" LIKE '$argon2id$%');
ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_expires_after_created_check" CHECK ("expires_at" > "created_at");
