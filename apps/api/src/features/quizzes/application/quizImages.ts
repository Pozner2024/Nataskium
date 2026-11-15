import type { QuizInput } from '@nataskium/shared/schemas'
import type { QuizImageFiles, QuizImageLinks } from '../types'
import { duplicateImage, imageStorageUnavailable, unknownImage } from './quizErrors'

// Все imageId викторины; одна картинка в двух местах запрещена: удаление из одного места удалило бы файл у другого
export function collectImageIds(input: QuizInput, files: QuizImageFiles | null): string[] {
  const ids = input.questions
    .flatMap((question) => [question.imageId, ...question.options.map((option) => option.imageId)])
    .filter((id) => id !== null)
  if (ids.length > 0 && files === null) throw imageStorageUnavailable()
  if (new Set(ids).size !== ids.length) throw duplicateImage()
  return ids
}

// Вызывать в транзакции после проверки владельца викторины: исключение откатывает сохранение.
// Возвращает id отвязанных картинок — их файлы удаляются только после коммита
export async function syncQuizImages(images: QuizImageLinks, quizId: string, teacherId: string, ids: string[]): Promise<string[]> {
  if ((await images.attach(quizId, teacherId, ids)) !== ids.length) throw unknownImage()
  return images.detachMissing(quizId, teacherId, ids)
}

// После коммита. Удаляются только строки, всё ещё не привязанные: другая вкладка могла успеть привязать
// картинку снова. Файлы — только удалённых строк. Сбой не валит ответ: оставшуюся строку добьёт очистка
// «осиротевших» картинок, файл без строки — сверка хранилища
export async function discardImages(files: QuizImageFiles | null, ids: string[]): Promise<void> {
  if (files === null || ids.length === 0) return
  try {
    const deleted = await files.deleteDetached(ids)
    await files.removeFiles(deleted)
  } catch (error) {
    console.error('Quiz image cleanup failed', error instanceof Error ? error.name : 'unknown')
  }
}
