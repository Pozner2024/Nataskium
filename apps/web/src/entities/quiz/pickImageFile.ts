import { MAX_IMAGE_UPLOAD_BYTES } from '@nataskium/shared/schemas'

// Те же форматы, что принимает сервер; тип по-настоящему проверяет сервер по содержимому файла
export const ACCEPTED_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_TYPE_PREFIX = 'image/'

export type ImageFileCheck = 'ok' | 'tooLarge' | 'notImage'

// Первый файл-картинка из выбора файла, перетаскивания или буфера обмена; текст игнорируется
export function pickImageFile(source: DataTransfer | ClipboardEvent['clipboardData'] | FileList | null): File | null {
  if (!source) return null
  const files = 'files' in source ? source.files : source
  return Array.from(files).find((file) => file.type.startsWith(IMAGE_TYPE_PREFIX)) ?? null
}

// Подсказка до отправки, чтобы не грузить заведомо отклонённый файл; решение всё равно за сервером
export function validateImageFile(file: File): ImageFileCheck {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'notImage'
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return 'tooLarge'
  return 'ok'
}
