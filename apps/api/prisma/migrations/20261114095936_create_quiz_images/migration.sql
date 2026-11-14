-- CreateTable
CREATE TABLE "quiz_images" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "quiz_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quiz_images_teacher_id_idx" ON "quiz_images"("teacher_id");

-- CreateIndex
CREATE INDEX "quiz_images_quiz_id_idx" ON "quiz_images"("quiz_id");

-- CreateIndex
CREATE INDEX "quiz_images_quiz_id_created_at_idx" ON "quiz_images"("quiz_id", "created_at");

-- AddForeignKey
ALTER TABLE "quiz_images" ADD CONSTRAINT "quiz_images_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_images" ADD CONSTRAINT "quiz_images_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

