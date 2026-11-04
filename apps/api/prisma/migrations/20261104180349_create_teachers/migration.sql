-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "email_verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teachers_email_key" ON "teachers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_google_id_key" ON "teachers"("google_id");

-- Добавлено вручную: Prisma не описывает CHECK в схеме
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_email_lowercase_check" CHECK ("email" = lower("email"));
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_login_method_check" CHECK ("password_hash" IS NOT NULL OR "google_id" IS NOT NULL);
-- Пустая строка не NULL: без этих CHECK '' обошла бы проверку способа входа
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_email_not_empty_check" CHECK ("email" <> '');
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_email_trimmed_check" CHECK ("email" = btrim("email", E' \t\r\n'));
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_password_hash_not_empty_check" CHECK ("password_hash" <> '');
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_google_id_not_empty_check" CHECK ("google_id" <> '');
