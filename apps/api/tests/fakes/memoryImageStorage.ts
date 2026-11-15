import { ExternalServiceError } from '../../src/shared/errors'
import { type ImageContentType, type ImageStorage, assertImageKey } from '../../src/shared/infrastructure'

export const MEMORY_IMAGES_BASE_URL = 'https://images.example.test'

export type StoredImage = { body: Uint8Array; contentType: ImageContentType }

// Хранилище в памяти: ключ проверяется так же, как в S3-реализации; objects — для проверок в тестах.
// modifiedAt — дата изменения для listObjects (put ставит текущую); тесты сдвигают её, чтобы «состарить» файл
export function makeMemoryImageStorage(publicBaseUrl: string = MEMORY_IMAGES_BASE_URL) {
  const objects = new Map<string, StoredImage>()
  const modifiedAt = new Map<string, Date>()
  // failing.put / failing.copy = true — метод бросает ExternalServiceError, как S3-реализация при сбое; calls.put — счётчик вызовов put
  const failing = { put: false, copy: false }
  const calls = { put: 0, copy: 0 }

  const storage: ImageStorage = {
    async put(key, body, contentType) {
      calls.put++
      assertImageKey(key)
      if (failing.put) throw new ExternalServiceError('memory-storage', null)
      objects.set(key, { body, contentType })
      modifiedAt.set(key, new Date())
    },
    async copy(fromKey, toKey) {
      calls.copy++
      assertImageKey(fromKey)
      assertImageKey(toKey)
      const source = objects.get(fromKey)
      // S3 на отсутствующий источник отвечает 404 — та же ExternalServiceError
      if (failing.copy || source === undefined) throw new ExternalServiceError('memory-storage', null)
      objects.set(toKey, source)
      modifiedAt.set(toKey, new Date())
    },
    async remove(keys) {
      keys.forEach(assertImageKey)
      for (const key of keys) {
        objects.delete(key)
        modifiedAt.delete(key)
      }
    },
    async listObjects(prefix) {
      return [...objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, lastModified: modifiedAt.get(key) ?? null }))
    },
    publicUrl(key) {
      assertImageKey(key)
      return `${publicBaseUrl}/${key}`
    },
  }

  return { storage, objects, modifiedAt, failing, calls }
}
