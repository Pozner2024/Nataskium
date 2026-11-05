-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- Добавлено вручную: Prisma не описывает CHECK в схеме
-- Только хэш argon2id: пароль в открытом виде сюда не запишется. NULL — учитель входит только через Google
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_password_hash_argon2id_check" CHECK ("password_hash" LIKE '$argon2id$%');
-- Управляющие символы (категория Cc: U+0001–U+001F, U+007F–U+009F) — явным диапазоном, чтобы не зависеть от локали БД
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_display_name_no_control_chars_check" CHECK ("display_name" !~ '[\x01-\x1f\x7f-\x9f]');
