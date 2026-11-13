-- CreateTable
CREATE TABLE "pending_google_reauths" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "state_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_google_reauths_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_google_reauths_state_hash_key" ON "pending_google_reauths"("state_hash");

-- CreateIndex
CREATE INDEX "pending_google_reauths_expires_at_idx" ON "pending_google_reauths"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "pending_google_reauths_teacher_id_key" ON "pending_google_reauths"("teacher_id");

-- AddForeignKey
ALTER TABLE "pending_google_reauths" ADD CONSTRAINT "pending_google_reauths_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Добавлено вручную: Prisma не описывает CHECK в схеме
-- В state_hash только HMAC-SHA256 в hex: сырой state (base64url) сюда не запишется
ALTER TABLE "pending_google_reauths" ADD CONSTRAINT "pending_google_reauths_state_hash_format_check" CHECK ("state_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "pending_google_reauths" ADD CONSTRAINT "pending_google_reauths_expires_after_created_check" CHECK ("expires_at" > "created_at");
