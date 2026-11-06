-- AlterTable
ALTER TABLE "pending_google_links" ADD COLUMN     "link_secret_hash" TEXT NOT NULL;

-- Добавлено вручную: Prisma не описывает CHECK в схеме
-- Только HMAC-SHA256 в hex: сырой секрет из cookie сюда не запишется
ALTER TABLE "pending_google_links" ADD CONSTRAINT "pending_google_links_link_secret_hash_format_check" CHECK ("link_secret_hash" ~ '^[0-9a-f]{64}$');
