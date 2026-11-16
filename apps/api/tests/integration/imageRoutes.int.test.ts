import { randomUUID } from 'node:crypto'
import { IMAGE_UPLOAD_FIELD, imageUploadResponseSchema } from '@nataskium/shared/schemas'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTokenService } from '../../src/features/auth'
import type { PrismaClient } from '../../src/generated/prisma/client'
import { MEMORY_IMAGES_BASE_URL, makeMemoryImageStorage } from '../fakes/memoryImageStorage'
import { TEST_ENV, TEST_WEB_ORIGIN, createTestApp, fromIp } from '../fakes/testApp'
import { EXIF_MARKER, HTML, SVG, jpegWithExif, pixelBombPng, png, truncatedJpeg, webp } from '../fixtures/imageFixtures'
import { createTeacher } from './authFixtures'
import { createTestPrisma, truncateAll } from './testDatabase'

const UPLOAD_PATH = '/api/quiz-images'
const MAX_SIDE_PX = 1200
const FAST_REJECTION_MS = 2000
const tokens = makeTokenService({ jwtSecret: TEST_ENV.JWT_SECRET, hmacSecret: TEST_ENV.HMAC_SECRET })

let prisma: PrismaClient

async function upload(storage: ReturnType<typeof makeMemoryImageStorage>, teacherId: string, bytes: Uint8Array, name = 'photo.jpg') {
  const body = new FormData()
  body.append(IMAGE_UPLOAD_FIELD, new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' }))
  return createTestApp({ prisma, imageStorage: storage.storage }).request(
    UPLOAD_PATH,
    { method: 'POST', headers: { origin: TEST_WEB_ORIGIN, authorization: `Bearer ${await tokens.signAccessToken(teacherId)}` }, body },
    fromIp(),
  )
}

beforeAll(async () => {
  prisma = await createTestPrisma()
})
beforeEach(async () => {
  await truncateAll(prisma)
})
afterEach(() => {
  vi.restoreAllMocks()
})
afterAll(async () => {
  await truncateAll(prisma)
  await prisma.$disconnect()
})

describe('POST /api/quiz-images', () => {
  it.each([
    ['JPEG с EXIF и GPS', () => jpegWithExif(2400, 1600)],
    ['PNG', () => png(1600, 1600)],
    ['WebP', () => webp(300, 200)],
  ])('%s → 201: WebP ≤ 1200 px без метаданных в хранилище, строка учителя без викторины', async (_name, make) => {
    const storage = makeMemoryImageStorage()
    const teacher = await createTeacher(prisma)

    const response = await upload(storage, teacher.id, await make())

    expect(response.status).toBe(201)
    const { image } = imageUploadResponseSchema.parse(await response.json())
    const key = `quiz-images/${image.id}.webp`
    expect(image.url).toBe(`${MEMORY_IMAGES_BASE_URL}/${key}`)
    expect(image.url).not.toContain(teacher.id)

    const stored = storage.objects.get(key)
    expect(stored?.contentType).toBe('image/webp')
    const meta = await sharp(stored!.body).metadata()
    expect(meta.format).toBe('webp')
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(MAX_SIDE_PX)
    expect(meta.exif).toBeUndefined()
    expect(Buffer.from(stored!.body).includes(EXIF_MARKER)).toBe(false)

    const rows = await prisma.quizImage.findMany()
    expect(rows).toMatchObject([{ id: image.id, teacherId: teacher.id, quizId: null }])
  })

  it.each([
    ['HTML под photo.jpg', () => HTML],
    ['SVG под photo.jpg', () => SVG],
  ])('%s → 400, ни файла, ни строки', async (_name, make) => {
    const storage = makeMemoryImageStorage()
    const teacher = await createTeacher(prisma)

    const response = await upload(storage, teacher.id, make())

    expect(response.status).toBe(400)
    expect(storage.calls.put).toBe(0)
    expect(await prisma.quizImage.count()).toBe(0)
  })

  it.each([
    ['«пиксельная бомба»', async () => pixelBombPng()],
    ['битый JPEG', truncatedJpeg],
  ])('%s → 400 быстрее 2 с, ни файла, ни строки', async (_name, make) => {
    const storage = makeMemoryImageStorage()
    const teacher = await createTeacher(prisma)
    const bytes = await make()
    const startedAt = performance.now()

    const response = await upload(storage, teacher.id, bytes)

    expect(response.status).toBe(400)
    expect(performance.now() - startedAt).toBeLessThan(FAST_REJECTION_MS)
    expect(storage.calls.put).toBe(0)
    expect(await prisma.quizImage.count()).toBe(0)
  })

  it('сбой хранилища → 503, строки нет', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = makeMemoryImageStorage()
    storage.failing.put = true
    const teacher = await createTeacher(prisma)

    const response = await upload(storage, teacher.id, await png(20, 20))

    expect(response.status).toBe(503)
    expect(await prisma.quizImage.count()).toBe(0)
  })

  it('учителя удалили до записи строки → 401 как у requireAuth, без записи в лог; файл из хранилища убран', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = makeMemoryImageStorage()

    const response = await upload(storage, randomUUID(), await png(20, 20))

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(errorLog).not.toHaveBeenCalled()
    expect(storage.objects.size).toBe(0)
    expect(await prisma.quizImage.count()).toBe(0)
  })
})
