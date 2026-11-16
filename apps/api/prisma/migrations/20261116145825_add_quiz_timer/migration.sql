-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN     "time_limit_seconds" INTEGER,
ADD COLUMN     "timer_mode" TEXT NOT NULL DEFAULT 'none';

-- Добавлено вручную: Prisma не описывает CHECK в схеме
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_timer_mode_check" CHECK ("timer_mode" IN ('none', 'stopwatch', 'limit'));
-- Секунды заданы только при limit. Границы 60 и 10800 дублируют MIN/MAX_TIME_LIMIT_SECONDS из packages/shared.
-- IS NOT NULL в ветке limit обязателен: при time_limit_seconds = NULL выражение BETWEEN даёт NULL, а CHECK
-- пропускает NULL, и строка (limit, NULL) прошла бы. Не «упрощать».
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_time_limit_check" CHECK (
  ("timer_mode" = 'limit' AND "time_limit_seconds" IS NOT NULL AND "time_limit_seconds" BETWEEN 60 AND 10800)
  OR ("timer_mode" <> 'limit' AND "time_limit_seconds" IS NULL)
);
