import type { TeacherImageFiles } from '../types'

// Id картинок — до удаления аккаунта: после него строк quiz_images нет. Картинка, загруженная между сбором
// и удалением, останется файлом без строки — её уберёт сверка хранилища
export async function collectTeacherImageIds(files: TeacherImageFiles | null | undefined, teacherId: string): Promise<string[]> {
  if (!files) return []
  return files.listIds(teacherId)
}

// После коммита удаления аккаунта. Сбой хранилища не откатывает удаление и не валит ответ: файлы найдёт сверка.
// В логе только тип ошибки: в ошибках S3 бывают ключи
export async function removeTeacherImageFiles(files: TeacherImageFiles | null | undefined, imageIds: string[]): Promise<void> {
  if (!files || imageIds.length === 0) return
  try {
    await files.removeFiles(imageIds)
  } catch (error) {
    console.error('Teacher image files cleanup failed', error instanceof Error ? error.name : 'unknown')
  }
}
