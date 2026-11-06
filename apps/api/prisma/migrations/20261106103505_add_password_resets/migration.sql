-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "password_resets_teacher_id_idx" ON "password_resets"("teacher_id");

-- CreateIndex
CREATE INDEX "password_resets_expires_at_idx" ON "password_resets"("expires_at");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Добавлено вручную: Prisma не описывает CHECK в схеме
-- В token_hash только HMAC-SHA256 в hex: сырой токен (base64url) сюда не запишется
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_expires_after_created_check" CHECK ("expires_at" > "created_at");
