-- DropIndex
DROP INDEX "password_resets_teacher_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_teacher_id_key" ON "password_resets"("teacher_id");
