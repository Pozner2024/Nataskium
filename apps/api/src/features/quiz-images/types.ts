// Проверка владельца — в findOwned: чужая картинка неотличима от отсутствующей
export type OwnedQuizImage = { id: string; quizId: string | null }

export type QuizImageRepository = {
  // id задаёт вызывающий (randomUUID): ключ файла нужен до записи строки
  create(id: string, teacherId: string): Promise<{ id: string }>
  findOwned(ids: readonly string[], teacherId: string): Promise<OwnedQuizImage[]>
  // Привязывает только картинки учителя, свободные или уже этой викторины; возвращает число привязанных —
  // меньше ids.length значит, что часть чужая, неизвестная или занята другой викториной
  attach(quizId: string, teacherId: string, ids: readonly string[]): Promise<number>
  // Отвязывает картинки учителя в этой викторине, которых нет в keepIds; возвращает id отвязанных
  detachMissing(quizId: string, teacherId: string, keepIds: readonly string[]): Promise<string[]>
  deleteRows(ids: readonly string[]): Promise<void>
  // Удаляет из ids только строки без викторины; возвращает id удалённых
  deleteDetached(ids: readonly string[]): Promise<string[]>
  // Не привязанные к викторине и созданные раньше olderThan
  listOrphans(olderThan: Date): Promise<string[]>
  // Какие из ids есть в базе (сверка с хранилищем)
  existingIds(ids: readonly string[]): Promise<string[]>
  // Число всех строк: предохранитель сверки от пустой или чужой базы
  countAll(): Promise<number>
}

// Байты недоверенного файла → WebP без метаданных; не картинка, битый файл или бомба — AppError(400)
export type ImageProcessor = (bytes: Uint8Array) => Promise<Uint8Array>

export type UploadedImage = { id: string; url: string }
