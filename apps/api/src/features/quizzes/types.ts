import type { QuizInput, QuizSummary } from '@nataskium/shared/schemas'
import type { ThumbnailSource } from '../../shared/application'

export type StoredQuiz = QuizInput & { id: string; shareToken: string; updatedAt: Date }

// Строка списка: превью ещё не собрано, вместо него первые элементы содержимого (head)
export type QuizListRow = Omit<QuizSummary, 'thumbnail'> & ThumbnailSource

// Каждый метод с teacherId сам проверяет владельца и deletedAt: чужая и удалённая викторины неотличимы от отсутствующей
export type QuizRepository = {
  // Без вопросов: список показывает только их количество, его считает база
  listByTeacher(teacherId: string): Promise<QuizListRow[]>
  // Только неудалённые
  countByTeacher(teacherId: string): Promise<number>
  findOwned(id: string, teacherId: string): Promise<StoredQuiz | null>
  // null — shareToken уже занят (одна повторная попытка с новым токеном делается в use-case);
  // 'referenceMissing' — нет учителя или группы (внешний ключ): транзакция прервана, причину выясняет use-case.
  // isPublic по умолчанию true: задание автоматически публикуется в библиотеку; копия из библиотеки — false
  create(teacherId: string, input: QuizInput, shareToken: string, isPublic?: boolean): Promise<StoredQuiz | null | 'referenceMissing'>
  updateOwned(id: string, teacherId: string, input: QuizInput): Promise<boolean>
  softDeleteOwned(id: string, teacherId: string): Promise<boolean>
  // Физически удаляет викторины всех учителей, мягко удалённые раньше olderThan; возвращает их число
  purgeDeletedBefore(olderThan: Date): Promise<number>
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
