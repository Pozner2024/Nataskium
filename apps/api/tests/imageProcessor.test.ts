import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { makeImageProcessor } from '../src/features/quiz-images'
import { AppError, ServiceBusyError } from '../src/shared/errors'
import {
  EXIF_MARKER,
  HTML,
  JPEG_MAGIC_WITH_HTML,
  SVG,
  avif,
  gif,
  jpegWithExif,
  pixelBombPng,
  png,
  rotatedJpeg,
  tiff,
  truncatedJpeg,
  webp,
} from './fixtures/imageFixtures'

const MAX_SIDE_PX = 1200
const FAST_REJECTION_MS = 2000
const UNSUPPORTED_MESSAGE = 'Unsupported or corrupted image'

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected rejection')
}

async function expectUnsupported(bytes: Uint8Array) {
  const error = await rejection(makeImageProcessor()(bytes))
  expect(error).toBeInstanceOf(AppError)
  expect(error).toMatchObject({ status: 400, message: UNSUPPORTED_MESSAGE })
}

describe('processImage: принимаемые форматы', () => {
  it.each([
    ['JPEG 2400×1600', () => jpegWithExif(2400, 1600), 1200, 800],
    ['PNG 1600×1600', () => png(1600, 1600), 1200, 1200],
    ['WebP 100×50 (не увеличивается)', () => webp(100, 50), 100, 50],
  ])('%s → WebP не больше 1200 px по большей стороне', async (_name, make, width, height) => {
    const output = await makeImageProcessor()(await make())
    const meta = await sharp(output).metadata()

    expect(meta.format).toBe('webp')
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(MAX_SIDE_PX)
    expect([meta.width, meta.height]).toEqual([width, height])
  })

  it('EXIF и GPS не переносятся в результат', async () => {
    const input = await jpegWithExif(400, 300)
    expect(input.includes(EXIF_MARKER)).toBe(true)

    const output = Buffer.from(await makeImageProcessor()(input))
    const meta = await sharp(output).metadata()

    expect(meta.exif).toBeUndefined()
    expect(meta.icc).toBeUndefined()
    expect(meta.xmp).toBeUndefined()
    expect(output.includes(EXIF_MARKER)).toBe(false)
  })

  it('снимок поворачивается по EXIF Orientation', async () => {
    const output = await makeImageProcessor()(await rotatedJpeg(300, 200))
    const meta = await sharp(output).metadata()

    expect([meta.width, meta.height]).toEqual([200, 300])
    expect(meta.orientation).toBeUndefined()
  })
})

describe('processImage: не картинка и чужие форматы → 400', () => {
  it.each([
    ['HTML', () => HTML],
    ['SVG со скриптом', () => SVG],
    ['сигнатура JPEG, дальше HTML', () => JPEG_MAGIC_WITH_HTML],
    ['пустой файл', () => new Uint8Array()],
  ])('%s', async (_name, make) => {
    await expectUnsupported(make())
  })

  it.each([
    ['GIF', gif],
    ['AVIF (HEIF)', avif],
    ['TIFF', tiff],
  ])('%s — sharp его декодирует, но мы не принимаем', async (_name, make) => {
    await expectUnsupported(await make())
  })
})

describe('processImage: бомба и битый файл', () => {
  it.each([
    ['«пиксельная бомба» PNG 20000×20000', async () => pixelBombPng()],
    ['обрезанный JPEG', truncatedJpeg],
  ])('%s → 400 быстрее 2 с', async (_name, make) => {
    const bytes = await make()
    const startedAt = performance.now()

    await expectUnsupported(bytes)

    expect(performance.now() - startedAt).toBeLessThan(FAST_REJECTION_MS)
  })
})

describe('processImage: параллельная обработка', () => {
  it('сверх очереди — 503 без обработки, остальные завершаются', async () => {
    const processImage = makeImageProcessor({ maxParallelJobs: 1, maxQueuedJobs: 1 })
    const input = await png(50, 50)

    const results = await Promise.allSettled([processImage(input), processImage(input), processImage(input)])

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled', 'rejected'])
    expect((results[2] as PromiseRejectedResult).reason).toBeInstanceOf(ServiceBusyError)
  })

  it('после сбоя слот освобождается', async () => {
    const processImage = makeImageProcessor({ maxParallelJobs: 1, maxQueuedJobs: 0 })

    await expect(processImage(HTML)).rejects.toBeInstanceOf(AppError)
    await expect(processImage(await png(10, 10))).resolves.toBeInstanceOf(Uint8Array)
  })
})
