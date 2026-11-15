import { randomUUID } from 'node:crypto'
import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORPHAN_IMAGE_TTL_MS, type QuizImageRepository, makeCleanupImages, quizImageKey } from '../src/features/quiz-images'
import { ExternalServiceError } from '../src/shared/errors'
import { makeMemoryImageStorage } from './fakes/memoryImageStorage'

const NOW = new Date('2026-11-14T12:00:00Z')
const HOUR_MS = 60 * 60 * 1000
const EXISTING_IDS_BATCH_SIZE = 1000
const BODY = new Uint8Array([1, 2, 3])
// Попадает в текст ошибок репозитория — в логах его быть не должно
const SECRET_ID = randomUUID()
const FOREIGN_KEYS = [
  'quiz-images/readme.txt',
  'quiz-images/0B5F1C2E-6C1A-4F5E-9D3A-1A2B3C4D5E6F.webp',
  'quiz-images/0b5f1c2e-6c1a-4f5e-9d3a-1a2b3c4d5e6f.png',
  'quiz-images/nested/0b5f1c2e-6c1a-4f5e-9d3a-1a2b3c4d5e6f.webp',
]

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms)
}

type Row = { quizId: string | null; createdAt: Date }

// Строки quiz_images в памяти с теми же условиями, что в Prisma-репозитории
function makeImageRows() {
  const rows = new Map<string, Row>()
  const calls = { existingIds: [] as number[] }
  const failing = { listOrphans: false, existingIds: false }
  const repository: QuizImageRepository = {
    async create(id) {
      rows.set(id, { quizId: null, createdAt: NOW })
      return { id }
    },
    async findOwned() {
      return []
    },
    async attach() {
      return 0
    },
    async detachMissing() {
      return []
    },
    async deleteRows(ids) {
      for (const id of ids) rows.delete(id)
    },
    async deleteDetached(ids) {
      const detached = ids.filter((id) => rows.get(id)?.quizId === null)
      for (const id of detached) rows.delete(id)
      return detached
    },
    async listOrphans(olderThan) {
      if (failing.listOrphans) throw new Error(`orphans failed for ${SECRET_ID}`)
      return [...rows].filter(([, row]) => row.quizId === null && row.createdAt < olderThan).map(([id]) => id)
    },
    async existingIds(ids) {
      calls.existingIds.push(ids.length)
      if (failing.existingIds) throw new Error(`existing failed for ${SECRET_ID}`)
      return ids.filter((id) => rows.has(id))
    },
    async countAll() {
      return rows.size
    },
  }
  return { repository, rows, calls, failing }
}

type SetupOptions = { withStorage?: boolean; reconcileStorage?: boolean; emptyDatabase?: boolean }

function setup(options: SetupOptions = {}) {
  const images = makeImageRows()
  const memory = makeMemoryImageStorage()
  const cleanup = makeCleanupImages({
    images: images.repository,
    storage: options.withStorage === false ? null : memory.storage,
    reconcileStorage: options.reconcileStorage ?? true,
    now: () => NOW,
  })

  // Строка и файл; возраст файла = возрасту строки (файл пишется перед строкой)
  async function addImage(quizId: string | null, age: number): Promise<string> {
    const id = randomUUID()
    images.rows.set(id, { quizId, createdAt: ago(age) })
    await storeFile(quizImageKey(id), age)
    return id
  }

  async function storeFile(key: string, age: number): Promise<void> {
    await memory.storage.put(key, BODY, 'image/webp')
    memory.modifiedAt.set(key, ago(age))
  }

  return { cleanup, images, memory, addImage, storeFile }
}

// В базе есть хотя бы одна строка — иначе срабатывает предохранитель пустой базы
async function setupWithRow(options: SetupOptions = {}) {
  const context = setup(options)
  const seeded = await context.addImage(randomUUID(), 30 * 24 * HOUR_MS)
  return { ...context, seeded }
}

let logs: unknown[][]
let errors: unknown[][]

beforeEach(() => {
  logs = []
  errors = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void logs.push(args))
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('makeCleanupImages: осиротевшие строки', () => {
  it('ORPHAN_IMAGE_TTL_MS — 24 часа', () => {
    expect(ORPHAN_IMAGE_TTL_MS).toBe(24 * HOUR_MS)
  })

  it('неприкреплённая картинка 25 ч назад удаляется вместе с файлом, 1 ч назад — нет', async () => {
    const { cleanup, images, memory, addImage } = setup()
    const old = await addImage(null, 25 * HOUR_MS)
    const fresh = await addImage(null, HOUR_MS)

    await cleanup()

    expect(images.rows.has(old)).toBe(false)
    expect(memory.objects.has(quizImageKey(old))).toBe(false)
    expect(images.rows.has(fresh)).toBe(true)
    expect(memory.objects.has(quizImageKey(fresh))).toBe(true)
  })

  it('прикреплённые к викторине не трогаются, даже старые', async () => {
    const { cleanup, images, memory, addImage } = setup()
    const attached = await addImage(randomUUID(), 30 * 24 * HOUR_MS)

    await cleanup()

    expect(images.rows.has(attached)).toBe(true)
    expect(memory.objects.has(quizImageKey(attached))).toBe(true)
  })

  it('картинку привязали между listOrphans и удалением — ни строка, ни файл не удаляются', async () => {
    const { cleanup, images, memory, addImage } = setup()
    const raced = await addImage(null, 25 * HOUR_MS)
    const listOrphans = images.repository.listOrphans
    images.repository.listOrphans = async (olderThan) => {
      const ids = await listOrphans(olderThan)
      images.rows.set(raced, { quizId: randomUUID(), createdAt: ago(25 * HOUR_MS) })
      return ids
    }

    await cleanup()

    expect(images.rows.has(raced)).toBe(true)
    expect(memory.objects.has(quizImageKey(raced))).toBe(true)
  })

  it('без хранилища удаляет только строки', async () => {
    const { cleanup, images } = setup({ withStorage: false })
    const old = randomUUID()
    const fresh = randomUUID()
    images.rows.set(old, { quizId: null, createdAt: ago(25 * HOUR_MS) })
    images.rows.set(fresh, { quizId: null, createdAt: ago(HOUR_MS) })

    await cleanup()

    expect(images.rows.has(old)).toBe(false)
    expect(images.rows.has(fresh)).toBe(true)
    expect(images.calls.existingIds).toEqual([])
  })
})

describe('makeCleanupImages: сверка хранилища с базой', () => {
  it('файл без строки старше 24 ч удаляется', async () => {
    const { cleanup, memory, storeFile } = await setupWithRow()
    const stray = quizImageKey(randomUUID())
    await storeFile(stray, 25 * HOUR_MS)

    await cleanup()

    expect(memory.objects.has(stray)).toBe(false)
  })

  it('reconcileStorage = false: сверки нет, а осиротевшие строки и их файлы удаляются', async () => {
    const { cleanup, images, memory, addImage, storeFile } = await setupWithRow({ reconcileStorage: false })
    const stray = quizImageKey(randomUUID())
    await storeFile(stray, 25 * HOUR_MS)
    const orphan = await addImage(null, 25 * HOUR_MS)

    await cleanup()

    expect(memory.objects.has(stray)).toBe(true)
    expect(images.rows.has(orphan)).toBe(false)
    expect(memory.objects.has(quizImageKey(orphan))).toBe(false)
    expect(images.calls.existingIds).toEqual([])
  })

  it('предохранитель: в базе нет ни одной строки — сверка ничего не удаляет, в логе только счётчик', async () => {
    const { cleanup, memory, storeFile } = setup()
    const strayId = randomUUID()
    await storeFile(quizImageKey(strayId), 25 * HOUR_MS)

    await cleanup()

    expect(memory.objects.has(quizImageKey(strayId))).toBe(true)
    expect(errors).toHaveLength(1)
    expect(inspect(errors, { depth: null })).toContain('candidates: 1')
    expect(inspect(errors, { depth: null })).not.toContain(strayId)
  })

  it('свежий файл без строки (загрузка ещё пишет строку) не удаляется', async () => {
    const { cleanup, memory, storeFile } = await setupWithRow()
    const uploading = quizImageKey(randomUUID())
    await storeFile(uploading, HOUR_MS)

    await cleanup()

    expect(memory.objects.has(uploading)).toBe(true)
  })

  it('объект без даты изменения не удаляется, их число — в лог', async () => {
    const { cleanup, memory, storeFile } = await setupWithRow()
    const undated = quizImageKey(randomUUID())
    await storeFile(undated, 25 * HOUR_MS)
    memory.modifiedAt.delete(undated)

    await cleanup()

    expect(memory.objects.has(undated)).toBe(true)
    expect(inspect(logs, { depth: null })).toContain('withoutDate: 1')
    expect(inspect(logs, { depth: null })).not.toContain(undated)
  })

  it('ключи не по шаблону quiz-images/<uuid>.webp не удаляются', async () => {
    const { cleanup, memory, seeded } = await setupWithRow()
    for (const key of FOREIGN_KEYS) {
      memory.objects.set(key, { body: BODY, contentType: 'image/webp' })
      memory.modifiedAt.set(key, ago(30 * 24 * HOUR_MS))
    }

    await cleanup()

    expect([...memory.objects.keys()].sort()).toEqual([...FOREIGN_KEYS, quizImageKey(seeded)].sort())
  })

  it('файлы, у которых есть строка, не удаляются', async () => {
    const { cleanup, memory, addImage } = setup()
    const attached = await addImage(randomUUID(), 30 * 24 * HOUR_MS)
    const freshDetached = await addImage(null, HOUR_MS)

    await cleanup()

    expect(memory.objects.has(quizImageKey(attached))).toBe(true)
    expect(memory.objects.has(quizImageKey(freshDetached))).toBe(true)
  })

  it('existingIds запрашивается пачками по 1000', async () => {
    const { cleanup, images, memory, storeFile, seeded } = await setupWithRow()
    const strayCount = EXISTING_IDS_BATCH_SIZE * 2
    for (let index = 0; index < strayCount; index++) await storeFile(quizImageKey(randomUUID()), 25 * HOUR_MS)

    await cleanup()

    expect(images.calls.existingIds).toEqual([EXISTING_IDS_BATCH_SIZE, EXISTING_IDS_BATCH_SIZE, 1])
    expect([...memory.objects.keys()]).toEqual([quizImageKey(seeded)])
  })
})

describe('makeCleanupImages: сбои и логи', () => {
  it('сбой шага строк не мешает сверке', async () => {
    const { cleanup, images, memory, storeFile } = await setupWithRow()
    images.failing.listOrphans = true
    const stray = quizImageKey(randomUUID())
    await storeFile(stray, 25 * HOUR_MS)

    await cleanup()

    expect(memory.objects.has(stray)).toBe(false)
    expect(errors).toHaveLength(1)
  })

  it('сбой сверки не мешает шагу строк', async () => {
    const { cleanup, images, addImage } = await setupWithRow()
    images.failing.existingIds = true
    const old = await addImage(null, 25 * HOUR_MS)

    await cleanup()

    expect(images.rows.has(old)).toBe(false)
    expect(errors).toHaveLength(1)
  })

  it('сбой удаления файлов осиротевших строк — строки удалены, файлы уберёт сверка', async () => {
    const { cleanup, images, memory, addImage } = await setupWithRow()
    const old = await addImage(null, 25 * HOUR_MS)
    const remove = memory.storage.remove
    memory.storage.remove = async () => {
      throw new ExternalServiceError('memory-storage', null)
    }

    await cleanup()

    expect(images.rows.has(old)).toBe(false)
    expect(memory.objects.has(quizImageKey(old))).toBe(true)

    memory.storage.remove = remove
    await cleanup()

    expect(memory.objects.has(quizImageKey(old))).toBe(false)
  })

  it('в логах только счётчики и тип ошибки, без id и ключей', async () => {
    const { cleanup, images, addImage, storeFile, seeded } = await setupWithRow()
    const old = await addImage(null, 25 * HOUR_MS)
    const strayId = randomUUID()
    await storeFile(quizImageKey(strayId), 25 * HOUR_MS)

    await cleanup()
    images.failing.listOrphans = true
    images.failing.existingIds = true
    await cleanup()

    const output = inspect([logs, errors], { depth: null })
    expect(logs.length).toBeGreaterThan(0)
    expect(errors.length).toBe(2)
    for (const secret of [old, strayId, seeded, SECRET_ID, 'quiz-images/']) expect(output).not.toContain(secret)
  })

  it('нечего чистить — в лог ничего не пишется', async () => {
    const { cleanup } = await setupWithRow()

    await cleanup()

    expect(logs).toEqual([])
    expect(errors).toEqual([])
  })
})
