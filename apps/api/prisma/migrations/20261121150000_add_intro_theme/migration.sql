-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN     "intro_theme" TEXT NOT NULL DEFAULT 'nataskium-night';

-- Добавлено вручную: Prisma не описывает CHECK в схеме. Список дублирует INTRO_THEME_KEYS из packages/shared:
-- новый стиль добавляется туда и сюда (новой миграцией)
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_intro_theme_check" CHECK ("intro_theme" IN ('nataskium-night', 'nataskium-day'));
