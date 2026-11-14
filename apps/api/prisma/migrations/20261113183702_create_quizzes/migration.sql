-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "share_token" TEXT NOT NULL,
    "show_answers" BOOLEAN NOT NULL DEFAULT true,
    "grading_scale" TEXT,
    "questions" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_share_token_key" ON "quizzes"("share_token");

-- CreateIndex
CREATE INDEX "quizzes_teacher_id_deleted_at_idx" ON "quizzes"("teacher_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Добавлено вручную: Prisma не описывает CHECK в схеме
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_grading_scale_check" CHECK ("grading_scale" IN ('ten', 'five', 'letter'));
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_title_not_empty_check" CHECK ("title" <> '');
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_share_token_not_empty_check" CHECK ("share_token" <> '');
