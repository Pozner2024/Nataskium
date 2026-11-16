import { QUIZ_IMAGE_KEY_PREFIX, quizImageKey } from './imageKey'
import type { QuizImageRepository, QuizImageStorage } from '../types'

// Картинку загрузили, но викторину не сохранили — через сутки строка и файл удаляются.
// Тот же срок защищает сверку: загрузка пишет файл раньше строки, свежий файл без строки — не сирота
export const ORPHAN_IMAGE_TTL_MS = 24 * 60 * 60 * 1000
// Не раздувать IN-список одного запроса к базе
const ID_BATCH_SIZE = 1000
// Остаток ключа после QUIZ_IMAGE_KEY_PREFIX — ровно как строит quizImageKey (randomUUID, нижний регистр)
const IMAGE_FILE_NAME_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/

export type CleanupImagesDeps = {
  images: QuizImageRepository
  // null — хранилище не настроено: файлов нет, чистятся только строки
  storage: QuizImageStorage | null
  // Сверка удаляет файлы без строки в базе — только если бакет принадлежит ТОЛЬКО этой базе (IMAGE_STORAGE_RECONCILE)
  reconcileStorage: boolean
  now: () => Date
}

function batches<T>(items: readonly T[]): T[][] {
  const result: T[][] = []
  for (let start = 0; start < items.length; start += ID_BATCH_SIZE) result.push(items.slice(start, start + ID_BATCH_SIZE))
  return result
}

// Только тип: в ошибках Prisma и S3 бывают id и ключи
function logFailure(step: string, error: unknown): void {
  console.error(`[image-cleanup] ${step} failed`, { errorType: error instanceof Error ? error.name : typeof error })
}

// Ключи не по шаблону (чужие объекты бакета) — null, сверка их не трогает
function imageIdFromKey(key: string): string | null {
  if (!key.startsWith(QUIZ_IMAGE_KEY_PREFIX)) return null
  return IMAGE_FILE_NAME_PATTERN.exec(key.slice(QUIZ_IMAGE_KEY_PREFIX.length))?.[1] ?? null
}

// Шаг 1: неприкреплённые строки старше срока. Удаляются только через deleteDetached (quiz_id IS NULL в той же
// команде) — картинку могли привязать после listOrphans. Файлы — только реально удалённых строк;
// не удалось — их найдёт сверка следующего запуска
async function removeOrphans(deps: CleanupImagesDeps, olderThan: Date): Promise<void> {
  const orphanIds = await deps.images.listOrphans(olderThan)
  const deletedIds: string[] = []
  for (const batch of batches(orphanIds)) deletedIds.push(...(await deps.images.deleteDetached(batch)))
  if (deletedIds.length === 0) return
  console.log('[image-cleanup] orphan images removed', { rows: deletedIds.length })
  if (deps.storage === null) return
  await deps.storage.remove(deletedIds.map(quizImageKey))
}

// Id файлов старше срока; объекты без даты не трогаем — неизвестно, не идёт ли к ним загрузка
async function listOldImageIds(storage: QuizImageStorage, olderThan: Date): Promise<string[]> {
  const objects = await storage.listObjects(QUIZ_IMAGE_KEY_PREFIX)
  const ids: string[] = []
  let withoutDate = 0
  for (const object of objects) {
    if (object.lastModified === null) {
      withoutDate++
      continue
    }
    if (object.lastModified >= olderThan) continue
    const id = imageIdFromKey(object.key)
    if (id !== null) ids.push(id)
  }
  if (withoutDate > 0) console.log('[image-cleanup] objects without modification date skipped', { withoutDate })
  return ids
}

// Шаг 2: файлы старше срока, для которых нет строки (например, строки удалены каскадом вместе с аккаунтом учителя)
async function removeStrayFiles(deps: CleanupImagesDeps, storage: QuizImageStorage, olderThan: Date): Promise<void> {
  const candidateIds = await listOldImageIds(storage, olderThan)
  const strayIds: string[] = []
  for (const batch of batches(candidateIds)) {
    const existing = new Set(await deps.images.existingIds(batch))
    strayIds.push(...batch.filter((id) => !existing.has(id)))
  }
  if (strayIds.length === 0) return
  // Пустая таблица при файлах в бакете — почти наверняка не та база (восстановленная, пустая, чужой бакет в .env)
  if ((await deps.images.countAll()) === 0) {
    console.error('[image-cleanup] stray files kept: quiz_images is empty', { candidates: strayIds.length })
    return
  }
  await storage.remove(strayIds.map(quizImageKey))
  console.log('[image-cleanup] stray files removed', { files: strayIds.length })
}

// Сбой одного шага не мешает другому и не роняет процесс — следующий запуск повторит
export function makeCleanupImages(deps: CleanupImagesDeps) {
  return async function cleanupImages(): Promise<void> {
    const olderThan = new Date(deps.now().getTime() - ORPHAN_IMAGE_TTL_MS)
    try {
      await removeOrphans(deps, olderThan)
    } catch (error) {
      logFailure('orphan images', error)
    }

    const { storage } = deps
    if (storage === null || !deps.reconcileStorage) return
    try {
      await removeStrayFiles(deps, storage, olderThan)
    } catch (error) {
      logFailure('stray files', error)
    }
  }
}
