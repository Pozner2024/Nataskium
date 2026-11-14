import { randomUUID } from 'node:crypto'
import { MAX_IMAGE_UPLOAD_BYTES } from '@nataskium/shared/schemas'
import { ExternalServiceError } from '../../../shared/errors'
import type { ImageStorage } from '../../../shared/infrastructure'
import { imageStorageUnavailable, imageTooLarge } from './imageErrors'
import { quizImageKey } from './imageKey'
import type { ImageProcessor, QuizImageRepository, UploadedImage } from '../types'

export type UploadImageDeps = {
  images: QuizImageRepository
  // null — хранилище не настроено (только вне production)
  storage: ImageStorage | null
  processImage: ImageProcessor
  generateId?: () => string
}

async function putOrUnavailable(storage: ImageStorage, key: string, body: Uint8Array): Promise<void> {
  try {
    await storage.put(key, body, 'image/webp')
  } catch (error) {
    if (!(error instanceof ExternalServiceError)) throw error
    console.error('ExternalServiceError', error.service, error.status)
    throw imageStorageUnavailable()
  }
}

// Строки без файла не бывает: файл пишется первым. Файл без строки (сбой записи строки) удаляем сразу,
// не вышло — его найдёт сверка хранилища с базой
async function removeQuietly(storage: ImageStorage, key: string): Promise<void> {
  try {
    await storage.remove([key])
  } catch (error) {
    console.error('Image cleanup after failed insert failed', error instanceof Error ? error.name : 'unknown')
  }
}

export function makeUploadImage(deps: UploadImageDeps) {
  const generateId = deps.generateId ?? randomUUID

  return async function uploadImage(teacherId: string, bytes: Uint8Array): Promise<UploadedImage> {
    const { storage } = deps
    if (storage === null) throw imageStorageUnavailable()
    // Повторная проверка: маршрут проверил File.size, здесь — фактическую длину до передачи в sharp
    if (bytes.byteLength > MAX_IMAGE_UPLOAD_BYTES) throw imageTooLarge()

    const webp = await deps.processImage(bytes)
    const id = generateId()
    const key = quizImageKey(id)
    await putOrUnavailable(storage, key, webp)
    try {
      await deps.images.create(id, teacherId)
    } catch (error) {
      await removeQuietly(storage, key)
      throw error
    }
    return { id, url: storage.publicUrl(key) }
  }
}
