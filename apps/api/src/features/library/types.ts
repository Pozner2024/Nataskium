import type { QuizInput } from '@nataskium/shared/schemas'

export type LibraryGroupRow = { slug: string; names: unknown }

// Строка публичного задания: только то, что можно показать любому. Вопросы — сырой jsonb, проверяет use-case
export type LibraryQuizRow = {
  number: number
  title: string
  groupSlug: string
  graded: boolean
  questions: unknown
  createdAt: Date
}

// Публичное задание целиком, с правильными ответами: только для «Взять себе», в публичные ответы не попадает
export type LibraryQuizCopyRow = {
  title: string
  showAnswers: boolean
  gradingScale: unknown
  groupSlug: string
  questions: unknown
}

export type LibraryListFilter = { group?: string; q?: string; offset: number; limit: number }

export type LibraryRepository = {
  // По порядку sort_order
  listGroups(): Promise<LibraryGroupRow[]>
  groupExists(slug: string): Promise<boolean>
  // Только публичные: is_public, не удалённые, не скрытые модерацией
  list(filter: LibraryListFilter): Promise<LibraryQuizRow[]>
  findByNumber(number: number): Promise<LibraryQuizRow | null>
  // То же условие публичности, но со всем содержимым для копирования
  findForCopy(number: number): Promise<LibraryQuizCopyRow | null>
}

// Адрес картинки по id; null — хранилище не настроено. Связывание с хранилищем — в app.ts
export type LibraryImageUrl = (imageId: string) => string | null

// Копии картинок для «Взять себе»: файл копируется внутри хранилища, строка картинки создаётся только после файла.
// Связывание с хранилищем и репозиторием картинок — в app.ts
export type LibraryImageCopier = {
  copyFile(fromImageId: string, toImageId: string): Promise<void>
  createRow(imageId: string, teacherId: string): Promise<void>
  deleteRows(imageIds: readonly string[]): Promise<void>
  removeFiles(imageIds: readonly string[]): Promise<void>
}

// Создание задания учителя без публикации в библиотеку; в app.ts — createQuiz из features/quizzes
export type LibraryCreateCopy = (teacherId: string, input: QuizInput, options: { isPublic: boolean }) => Promise<{ id: string }>
