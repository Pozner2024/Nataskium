-- Откат (вручную, down-миграций у Prisma нет; перед применением на общей БД — бэкап):
--   ALTER TABLE "quizzes" DROP CONSTRAINT "quizzes_group_slug_fkey";
--   ALTER TABLE "quizzes" DROP COLUMN "group_slug", DROP COLUMN "is_public", DROP COLUMN "moderation_hidden_at", DROP COLUMN "public_number";
--   DROP TABLE "library_groups";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261115120000_create_library';

-- CreateTable
CREATE TABLE "library_groups" (
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "names" JSONB NOT NULL,

    CONSTRAINT "library_groups_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_groups_sort_order_key" ON "library_groups"("sort_order");

-- Добавлено вручную: Prisma не описывает CHECK в схеме. Языки — SUPPORTED_LOCALES из packages/shared
ALTER TABLE "library_groups" ADD CONSTRAINT "library_groups_slug_format_check"
    CHECK ("slug" ~ '^[a-z][a-z0-9-]{1,39}$' AND "slug" <> 'quiz');
ALTER TABLE "library_groups" ADD CONSTRAINT "library_groups_names_check"
    CHECK (
        jsonb_typeof("names") = 'object'
        AND "names" ?& ARRAY['ru', 'en', 'de', 'fr']
        AND btrim("names" ->> 'ru') <> ''
        AND btrim("names" ->> 'en') <> ''
        AND btrim("names" ->> 'de') <> ''
        AND btrim("names" ->> 'fr') <> ''
    );

-- Стартовые группы; порядок — sort_order с шагом 10, чтобы новую группу можно было вставить между соседями.
-- Группы до FK: существующие задания получают 'other', и ссылка должна сразу находить строку
INSERT INTO "library_groups" ("slug", "sort_order", "names") VALUES
    ('exact', 10, '{"ru": "Точные науки", "en": "Mathematics & Sciences", "de": "Mathematik und exakte Wissenschaften", "fr": "Mathématiques et sciences exactes"}'),
    ('it', 20, '{"ru": "Информатика и технологии", "en": "Computer Science & Technology", "de": "Informatik und Technologie", "fr": "Informatique et technologies"}'),
    ('natural', 30, '{"ru": "Естественные науки", "en": "Natural Sciences", "de": "Naturwissenschaften", "fr": "Sciences naturelles"}'),
    ('languages', 40, '{"ru": "Языки и литература", "en": "Languages & Literature", "de": "Sprachen und Literatur", "fr": "Langues et littérature"}'),
    ('humanities', 50, '{"ru": "Гуманитарные науки", "en": "Humanities", "de": "Geisteswissenschaften", "fr": "Sciences humaines"}'),
    ('arts', 60, '{"ru": "Искусство и творчество", "en": "Arts & Creativity", "de": "Kunst und Kreativität", "fr": "Arts et créativité"}'),
    ('health', 70, '{"ru": "Спорт и здоровье", "en": "Health & Physical Education", "de": "Sport und Gesundheit", "fr": "Sport et santé"}'),
    ('vocational', 80, '{"ru": "Профессиональное обучение", "en": "Vocational Education", "de": "Berufsbildung", "fr": "Formation professionnelle"}'),
    ('primary', 90, '{"ru": "Начальная школа", "en": "Primary School", "de": "Grundschule", "fr": "École primaire"}'),
    ('other', 100, '{"ru": "Разное", "en": "Other", "de": "Sonstiges", "fr": "Divers"}');

-- AlterTable: существующие задания публикуются (решение пользователя 2026-11-15), номера проставляет SERIAL
ALTER TABLE "quizzes" ADD COLUMN     "group_slug" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "moderation_hidden_at" TIMESTAMPTZ,
ADD COLUMN     "public_number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_public_number_key" ON "quizzes"("public_number");

-- CreateIndex
CREATE INDEX "quizzes_group_slug_created_at_idx" ON "quizzes"("group_slug", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_group_slug_fkey" FOREIGN KEY ("group_slug") REFERENCES "library_groups"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
