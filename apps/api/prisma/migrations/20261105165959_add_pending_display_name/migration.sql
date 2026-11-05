-- AlterTable
ALTER TABLE "pending_registrations" ADD COLUMN     "display_name" TEXT;

-- Добавлено вручную: те же CHECK, что у teachers.display_name, — имя переносится туда при подтверждении
-- NULL допустим; 100 — DISPLAY_NAME_MAX_LENGTH из packages/shared, длина в code points, как в Zod
ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_display_name_length_check" CHECK (char_length("display_name") BETWEEN 1 AND 100);
ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_display_name_trimmed_check" CHECK ("display_name" = btrim("display_name", E' \t\r\n'));
-- Управляющие символы (категория Cc: U+0001–U+001F, U+007F–U+009F) — явным диапазоном, чтобы не зависеть от локали БД
ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_display_name_no_control_chars_check" CHECK ("display_name" !~ '[\x01-\x1f\x7f-\x9f]');
