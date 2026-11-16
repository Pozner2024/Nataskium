-- Тип задания (ADR-0013). Миграция ВЫСОКОГО РИСКА: down-миграций у Prisma нет; перед применением на общей БД — бэкап.
-- Порядок выката: сначала эта миграция, затем API и web вместе.
--
-- Откат кода (старый код парсит любую строку схемой викторины и падает на строках matching):
--   1. Сохранить id затронутых строк: SELECT "id" FROM "quizzes" WHERE "type" = 'matching' AND "deleted_at" IS NULL;
--   2. UPDATE "quizzes" SET "deleted_at" = now(), "is_public" = false WHERE "type" = 'matching' AND "deleted_at" IS NULL;
--   После повторного выката строки из списка можно вернуть ("deleted_at" = NULL) в пределах 30 дней, до purge.
--
-- Откат миграции (вручную, только после отката кода и когда строк matching нет):
--   ALTER TABLE "quizzes" DROP CONSTRAINT "quizzes_matching_pairs_check";
--   ALTER TABLE "quizzes" DROP CONSTRAINT "quizzes_type_check";
--   ALTER TABLE "quizzes" DROP COLUMN "type";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261116190000_add_quiz_type';

-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'quiz';

-- Добавлено вручную: Prisma не описывает CHECK в схеме. Типы — ACTIVITY_KINDS из packages/shared
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_type_check" CHECK ("type" IN ('quiz', 'matching'));
-- Границы 2 и 10 дублируют MIN/MAX_MATCHING_PAIRS из packages/shared. Форму вопросов викторины база не проверяет.
-- CASE, а не AND: порядок вычисления AND в PostgreSQL не гарантирован, и jsonb_array_length на не-массиве
-- бросил бы ошибку вместо нарушения CHECK. Не «упрощать».
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_matching_pairs_check" CHECK (
  "type" <> 'matching'
  OR CASE WHEN jsonb_typeof("questions") = 'array' THEN jsonb_array_length("questions") BETWEEN 2 AND 10 ELSE false END
);
