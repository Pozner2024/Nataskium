import type { ActivityKind, MatchingInput, QuizInput, TrueFalseInput } from '@nataskium/shared/schemas'

export type LibraryGroupRow = { slug: string; names: unknown }

// Публичные поля задания: только то, что можно показать любому
export type LibraryQuizMeta = {
  number: number
  type: ActivityKind
  title: string
  groupSlug: string
  graded: boolean
  createdAt: Date
}

// Строка карточки задания. Содержимое (вопросы или пары, по type) — сырой jsonb, проверяет use-case
export type LibraryQuizRow = LibraryQuizMeta & { questions: unknown }

// Строка списка: вопросы не загружаются, их количество считает база
export type LibraryQuizListRow = LibraryQuizMeta & { questionCount: number }

// Публичное задание целиком, с правильными ответами: только для «Взять себе», в публичные ответы не попадает
export type LibraryQuizCopyRow = {
  type: ActivityKind
  title: string
  showAnswers: boolean
  gradingScale: unknown
  groupSlug: string
  timerMode: string
  timeLimitSeconds: number | null
  questions: unknown
}

export type LibraryListFilter = { group?: string; q?: string; offset: number; limit: number }

export type LibraryRepository = {
  // По порядку sort_order
  listGroups(): Promise<LibraryGroupRow[]>
  groupExists(slug: string): Promise<boolean>
  // Только публичные: is_public, не удалённые, не скрытые модерацией
  list(filter: LibraryListFilter): Promise<LibraryQuizListRow[]>
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
  // false — учителя уже нет (аккаунт удалён при ещё действующем access-токене)
  createRow(imageId: string, teacherId: string): Promise<boolean>
  deleteRows(imageIds: readonly string[]): Promise<void>
  removeFiles(imageIds: readonly string[]): Promise<void>
}

// Создание задания учителя без публикации в библиотеку; в app.ts — createQuiz из features/quizzes
export type LibraryCreateCopy = (teacherId: string, input: QuizInput, options: { isPublic: boolean }) => Promise<{ id: string }>

// То же для сопоставления; в app.ts — createMatching из features/matchings
export type LibraryCreateMatchingCopy = (teacherId: string, input: MatchingInput, options: { isPublic: boolean }) => Promise<{ id: string }>

// То же для «да/нет»; в app.ts — createTrueFalse из features/trueFalse
export type LibraryCreateTrueFalseCopy = (teacherId: string, input: TrueFalseInput, options: { isPublic: boolean }) => Promise<{ id: string }>

// Порядок слов сопоставления на карточке; в app.ts — secureShuffle
export type LibraryShuffle = <T>(items: readonly T[]) => T[]
