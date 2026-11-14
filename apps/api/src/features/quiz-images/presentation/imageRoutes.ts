// Загрузка картинки учителем: только под Bearer, лимиты на IP и на учителя.
// Имя файла и его Content-Type не используются и не логируются: формат определяет sharp по содержимому
import { IMAGE_UPLOAD_FIELD, type ImageUploadResponse, MAX_IMAGE_UPLOAD_BYTES } from '@nataskium/shared/schemas'
import { type Context, Hono, type MiddlewareHandler } from 'hono'
import { AppError, ServiceBusyError } from '../../../shared/errors'
import type { RateLimiter } from '../../../shared/middleware'
import { imageFileRequired, imageTooLarge, imageUploadTimedOut } from '../application/imageErrors'
import type { UploadedImage } from '../types'
import { type UploadSlotLimits, makeUploadSlots } from './uploadSlots'

export const QUIZ_IMAGE_ROUTES_BASE_PATH = '/api/quiz-images'

const CREATED_STATUS = 201
const UPLOADS_BUSY_RETRY_AFTER_SECONDS = 5

export type ImageRouterDeps = {
  uploadImage: (teacherId: string, bytes: Uint8Array) => Promise<UploadedImage>
  requireAuth: MiddlewareHandler
  clientIp: (c: Context) => string
  limiters: { perIp: RateLimiter; perTeacher: RateLimiter }
  concurrent: UploadSlotLimits
  // Сколько ждать тело загрузки после занятия слота
  bodyReadTimeoutMs: number
  // Лимит тела (16 МБ) — параметром из app.ts: тот же формат 413, что и у остальных маршрутов
  bodyLimit: MiddlewareHandler
}

// Ровно один файл в поле IMAGE_UPLOAD_FIELD; битое multipart-тело — та же 400, что и отсутствие файла
async function readSingleFile(c: Context): Promise<File> {
  let body: Record<string, unknown>
  try {
    body = await c.req.parseBody({ all: true })
  } catch {
    throw imageFileRequired()
  }
  const file = body[IMAGE_UPLOAD_FIELD]
  if (!(file instanceof File)) throw imageFileRequired()
  return file
}

// Лимит размера и разбор multipart — одним шагом: тело без Content-Length bodyLimit читает сам, до разбора.
// Обрыв соединения при чтении — ошибка клиента, а не 500 с записью в лог
async function readLimitedFile(c: Context, bodyLimit: MiddlewareHandler): Promise<File> {
  const read: { file?: File } = {}
  try {
    await bodyLimit(c, async () => {
      read.file = await readSingleFile(c)
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    throw imageFileRequired()
  }
  if (read.file === undefined) throw imageFileRequired()
  return read.file
}

// Недочитанное тело после ответа дочищает @hono/node-server (autoCleanupIncoming): дочитывает недолго и закрывает
// соединение. Поздний отказ work обрабатывает сам Promise.race — необработанного отклонения нет
async function withinTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(imageUploadTimedOut()), timeoutMs)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function makeImageRouter(deps: ImageRouterDeps) {
  const router = new Hono()
  const slots = makeUploadSlots(deps.concurrent)
  router.use(deps.requireAuth)

  // Слот занимается до чтения тела и освобождается при любом исходе: 413, 408, обрыв соединения, сбой обработки
  const uploadSlot: MiddlewareHandler = async (c, next) => {
    const release = slots.tryAcquire(c.get('teacherId'))
    if (release === null) throw new ServiceBusyError(UPLOADS_BUSY_RETRY_AFTER_SECONDS)
    try {
      await next()
    } finally {
      release()
    }
  }

  router.post(
    '/',
    deps.limiters.perTeacher.middleware((c) => c.get('teacherId')),
    deps.limiters.perIp.middleware(deps.clientIp),
    uploadSlot,
    async (c) => {
      // Таймаут — только на чтение тела: обработка картинки идёт уже без него, но в том же слоте
      const file = await withinTimeout(readLimitedFile(c, deps.bodyLimit), deps.bodyReadTimeoutMs)
      if (file.size > MAX_IMAGE_UPLOAD_BYTES) throw imageTooLarge()
      const image = await deps.uploadImage(c.get('teacherId'), await file.bytes())
      const response: ImageUploadResponse = { image }
      return c.json(response, CREATED_STATUS)
    },
  )

  return router
}
