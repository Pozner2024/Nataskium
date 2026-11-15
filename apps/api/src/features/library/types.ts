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

export type LibraryListFilter = { group?: string; q?: string; offset: number; limit: number }

export type LibraryRepository = {
  // По порядку sort_order
  listGroups(): Promise<LibraryGroupRow[]>
  groupExists(slug: string): Promise<boolean>
  // Только публичные: is_public, не удалённые, не скрытые модерацией
  list(filter: LibraryListFilter): Promise<LibraryQuizRow[]>
  findByNumber(number: number): Promise<LibraryQuizRow | null>
}

// Адрес картинки по id; null — хранилище не настроено. Связывание с хранилищем — в app.ts
export type LibraryImageUrl = (imageId: string) => string | null
