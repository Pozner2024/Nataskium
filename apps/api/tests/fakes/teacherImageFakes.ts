import { randomUUID } from 'node:crypto'
import type { TeacherImageFiles } from '../../src/features/auth'
import { quizImageKey } from '../../src/features/quiz-images'
import { ExternalServiceError } from '../../src/shared/errors'
import { makeMemoryImageStorage } from './memoryImageStorage'

const IMAGE_BODY = new Uint8Array([1, 2, 3])

// Картинки учителей в хранилище в памяти: по imagesPerTeacher файлов на каждого из teacherIds.
// failing.remove = true — удаление файлов бросает ExternalServiceError, как S3 при сбое
export async function makeMemoryTeacherImages(teacherIds: readonly string[], imagesPerTeacher = 2) {
  const memory = makeMemoryImageStorage()
  const owners = new Map<string, string[]>()
  for (const teacherId of teacherIds) {
    const ids = Array.from({ length: imagesPerTeacher }, () => randomUUID())
    for (const id of ids) await memory.storage.put(quizImageKey(id), IMAGE_BODY, 'image/webp')
    owners.set(teacherId, ids)
  }
  const failing = { remove: false }
  const files: TeacherImageFiles = {
    async listIds(teacherId) {
      return [...(owners.get(teacherId) ?? [])]
    },
    async removeFiles(imageIds) {
      if (failing.remove) throw new ExternalServiceError('memory-storage', null)
      await memory.storage.remove(imageIds.map(quizImageKey))
    },
  }
  const keysOf = (teacherId: string) => (owners.get(teacherId) ?? []).map(quizImageKey)
  return { files, memory, failing, keysOf }
}
