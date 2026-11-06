-- CreateTable
CREATE TABLE "pending_google_links" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "google_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_google_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_google_links_token_hash_key" ON "pending_google_links"("token_hash");

-- CreateIndex
CREATE INDEX "pending_google_links_expires_at_idx" ON "pending_google_links"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "pending_google_links_teacher_id_key" ON "pending_google_links"("teacher_id");

-- AddForeignKey
ALTER TABLE "pending_google_links" ADD CONSTRAINT "pending_google_links_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Добавлено вручную: Prisma не описывает CHECK в схеме
-- В token_hash только HMAC-SHA256 в hex: сырой токен (base64url) сюда не запишется
ALTER TABLE "pending_google_links" ADD CONSTRAINT "pending_google_links_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "pending_google_links" ADD CONSTRAINT "pending_google_links_expires_after_created_check" CHECK ("expires_at" > "created_at");
ALTER TABLE "pending_google_links" ADD CONSTRAINT "pending_google_links_google_id_not_empty_check" CHECK ("google_id" <> '');
