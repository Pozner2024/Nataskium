// Обработка файлов от посторонних, которые потом видят дети: sharp (libvips) — нативный код,
// поэтому до него доходят только файлы с сигнатурой JPEG, PNG или WebP, а результат всегда перекодируется
import sharp from 'sharp'
import { ServiceBusyError } from '../../../shared/errors'
import { unsupportedImage } from '../application/imageErrors'
import type { ImageProcessor } from '../types'

const MAX_IMAGE_SIDE_PX = 1200
const WEBP_QUALITY = 82
const MAX_INPUT_PIXELS = 50_000_000
const PROCESSING_TIMEOUT_SECONDS = 10
// Распакованная картинка в худшем случае (50 Мпикс × 4 канала RGBA × 2 байта на 16-битный канал) — ~400 МБ:
// одновременно обрабатывается одна
const MAX_PARALLEL_JOBS = 1
const MAX_QUEUED_JOBS = 8
const BUSY_RETRY_AFTER_SECONDS = 5
const ACCEPTED_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp'])

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]
const WEBP_SIGNATURE_OFFSET = 8

export type ImageProcessorOptions = { maxParallelJobs: number; maxQueuedJobs: number }

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

// До sharp: иначе SVG ушёл бы в librsvg, TIFF — в libtiff и т. д.
function hasAcceptedSignature(bytes: Uint8Array): boolean {
  if (startsWith(bytes, JPEG_SIGNATURE) || startsWith(bytes, PNG_SIGNATURE)) return true
  return startsWith(bytes, RIFF_SIGNATURE) && startsWith(bytes, WEBP_SIGNATURE, WEBP_SIGNATURE_OFFSET)
}

// failOn 'warning' — самый строгий уровень (рекомендован sharp для недоверенных файлов): битый файл → ошибка.
// Без animated: у анимированных WebP/PNG берётся первый кадр
function decoder(bytes: Uint8Array) {
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'warning' })
}

// Формат — по содержимому, а не по имени и Content-Type. Валиден только файл, который удалось перекодировать.
// Метаданные (EXIF, GPS, ICC) не переносятся: withMetadata/keepMetadata не вызываются
async function convertToWebp(bytes: Uint8Array): Promise<Uint8Array> {
  if (!hasAcceptedSignature(bytes)) throw unsupportedImage()
  try {
    const { format } = await decoder(bytes).metadata()
    if (!ACCEPTED_FORMATS.has(format)) throw unsupportedImage()
    return await decoder(bytes)
      .autoOrient()
      .resize(MAX_IMAGE_SIDE_PX, MAX_IMAGE_SIDE_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .timeout({ seconds: PROCESSING_TIMEOUT_SECONDS })
      .toBuffer()
  } catch {
    // Текст ошибки sharp не логируем и не отдаём: в нём могут быть фрагменты файла
    throw unsupportedImage()
  }
}

export function makeImageProcessor(
  { maxParallelJobs, maxQueuedJobs }: ImageProcessorOptions = { maxParallelJobs: MAX_PARALLEL_JOBS, maxQueuedJobs: MAX_QUEUED_JOBS },
): ImageProcessor {
  // Глобальные настройки sharp — здесь, а не при импорте модуля.
  // Кэш операций libvips держит распакованные картинки в памяти — для разовых загрузок он не нужен.
  // Один поток libvips на картинку: обработка не занимает все ядра, API продолжает отвечать
  sharp.cache(false)
  sharp.concurrency(1)

  let running = 0
  const queue: (() => void)[] = []

  // Проверка и занятие слота — синхронно, без await: в одном потоке Node это атомарно
  async function acquire(): Promise<void> {
    if (running < maxParallelJobs) {
      running++
      return
    }
    if (queue.length >= maxQueuedJobs) throw new ServiceBusyError(BUSY_RETRY_AFTER_SECONDS)
    await new Promise<void>((resolve) => queue.push(resolve))
  }

  // Слот передаётся следующему в очереди, счётчик не меняется
  function release(): void {
    const next = queue.shift()
    if (next === undefined) running--
    else next()
  }

  return async function processImage(bytes) {
    await acquire()
    try {
      return await convertToWebp(bytes)
    } finally {
      release()
    }
  }
}
