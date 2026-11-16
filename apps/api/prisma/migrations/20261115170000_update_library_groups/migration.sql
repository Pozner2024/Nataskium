-- Восемь разделов вместо десяти (ADR-0006). Схема не меняется, только данные library_groups.
-- Откат: вернуть строки из миграции create_library (задания, перенесённые в other, обратно не разносятся)

-- Задания из убираемых групп — в «Разное»: FK с ON DELETE RESTRICT не даст удалить группу с заданиями
UPDATE "quizzes" SET "group_slug" = 'other' WHERE "group_slug" IN ('languages', 'arts', 'health', 'primary');

DELETE FROM "library_groups" WHERE "slug" IN ('languages', 'arts', 'health', 'primary');

-- sort_order уникален: сначала уводим оставшиеся с дороги, затем ставим новый порядок
UPDATE "library_groups" SET "sort_order" = "sort_order" + 1000;

INSERT INTO "library_groups" ("slug", "sort_order", "names") VALUES
    ('creative', 20, '{"ru": "Творческие и прикладные науки", "en": "Creative & Applied Sciences", "de": "Kreative und angewandte Fächer", "fr": "Sciences créatives et appliquées"}'),
    ('skills', 70, '{"ru": "Развитие навыков", "en": "Skills Development", "de": "Kompetenzentwicklung", "fr": "Développement des compétences"}');

UPDATE "library_groups" SET "sort_order" = 10 WHERE "slug" = 'exact';
UPDATE "library_groups" SET "sort_order" = 30 WHERE "slug" = 'it';
UPDATE "library_groups" SET "sort_order" = 40 WHERE "slug" = 'natural';
UPDATE "library_groups" SET "sort_order" = 50 WHERE "slug" = 'humanities';
UPDATE "library_groups" SET "sort_order" = 60 WHERE "slug" = 'vocational';
UPDATE "library_groups" SET "sort_order" = 80 WHERE "slug" = 'other';
