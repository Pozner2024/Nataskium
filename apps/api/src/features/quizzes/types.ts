import type { QuizInput } from '@nataskium/shared/schemas'

export type StoredQuiz = QuizInput & { id: string; shareToken: string; updatedAt: Date }

// Каждый метод с teacherId сам проверяет владельца и deletedAt: чужая и удалённая викторины неотличимы от отсутствующей
export type QuizRepository = {
  listByTeacher(teacherId: string): Promise<StoredQuiz[]>
  // Только неудалённые
  countByTeacher(teacherId: string): Promise<number>
  findOwned(id: string, teacherId: string): Promise<StoredQuiz | null>
  // null — shareToken уже занят (одна повторная попытка с новым токеном делается в use-case)
  // isPublic по умолчанию true: задание автоматически публикуется в библиотеку; копия из библиотеки — false
  create(teacherId: string, input: QuizInput, shareToken: string, isPublic?: boolean): Promise<StoredQuiz | null>
  updateOwned(id: string, teacherId: string, input: QuizInput): Promise<boolean>
  softDeleteOwned(id: string, teacherId: string): Promise<boolean>
  groupExists(slug: string): Promise<boolean>
  // Для ученика: без владельца, но удалённая не находится
  findByShareToken(token: string): Promise<StoredQuiz | null>
}

// Картинки викторины внутри транзакции сохранения. Реализация — репозиторий quiz-images, связывание в app.ts
export type QuizImageLinks = {
  // Привязывает только картинки учителя, свободные или уже этой викторины; возвращает число привязанных
  attach(quizId: string, teacherId: string, ids: readonly string[]): Promise<number>
  // Отвязывает картинки викторины, которых нет в keepIds; возвращает id отвязанных
  detachMissing(quizId: string, teacherId: string, keepIds: readonly string[]): Promise<string[]>
}

export type QuizTransactionRepositories = { quizzes: QuizRepository; images: QuizImageLinks }

// Всё, что сделано в work, фиксируется вместе; исключение из work откатывает всё
export type QuizTransaction = <T>(work: (repositories: QuizTransactionRepositories) => Promise<T>) => Promise<T>

// Файлы картинок в хранилище; в use-case — null, если хранилище не настроено
export type QuizImageFiles = {
  publicUrl(imageId: string): string
  removeFiles(imageIds: readonly string[]): Promise<void>
  // Удаляет строки из imageIds, не привязанные ни к одной викторине; возвращает id удалённых
  deleteDetached(imageIds: readonly string[]): Promise<string[]>
}

export type QuizWriteDeps = {
  quizzes: QuizRepository
  transaction: QuizTransaction
  imageFiles: QuizImageFiles | null
}
