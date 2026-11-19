-- Тип задания «да/нет» (truefalse). Миграция ВЫСОКОГО РИСКА: down-миграций у Prisma нет; перед применением на общей БД — бэкап.
-- Порядок выката: сначала эта миграция, затем API и web вместе.
--
-- Откат кода (старый код парсит любую строку схемой викторины и падает на строках truefalse):
--   1. Сохранить id затронутых строк: SELECT "id" FROM "quizzes" WHERE "type" = 'truefalse' AND "deleted_at" IS NULL;
--   2. UPDATE "quizzes" SET "deleted_at" = now(), "is_public" = false WHERE "type" = 'truefalse' AND "deleted_at" IS NULL;
--   После повторного выката строки из списка можно вернуть ("deleted_at" = NULL) в пределах 30 дней, до purge.
--
-- Откат миграции (вручную, только после отката кода и когда строк truefalse нет):
--   ALTER TABLE "quizzes" DROP CONSTRAINT "quizzes_truefalse_items_check";
--   ALTER TABLE "quizzes" DROP CONSTRAINT "quizzes_type_check";
--   ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_type_check" CHECK ("type" IN ('quiz', 'matching'));
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261119120000_add_truefalse_type';

-- Добавлено вручную: Prisma не описывает CHECK в схеме. Типы — ACTIVITY_KINDS из packages/shared
ALTER TABLE "quizzes" DROP CONSTRAINT "quizzes_type_check";
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_type_check" CHECK ("type" IN ('quiz', 'matching', 'truefalse'));
-- Границы 2 и 30 дублируют MIN/MAX_TRUE_FALSE_ITEMS из packages/shared.
-- CASE, а не AND: порядок вычисления AND в PostgreSQL не гарантирован, и jsonb_array_length на не-массиве
-- бросил бы ошибку вместо нарушения CHECK. Не «упрощать».
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_truefalse_items_check" CHECK (
  "type" <> 'truefalse'
  OR CASE WHEN jsonb_typeof("questions") = 'array' THEN jsonb_array_length("questions") BETWEEN 2 AND 30 ELSE false END
);
