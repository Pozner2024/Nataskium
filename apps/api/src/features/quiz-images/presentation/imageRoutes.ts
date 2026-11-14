// Загрузка картинки учителем: только под Bearer, лимиты на IP и на учителя.
// Имя файла и его Content-Type не используются и не логируются: формат определяет sharp по содержимому
import { IMAGE_UPLOAD_FIELD, type ImageUploadResponse, MAX_IMAGE_UPLOAD_BYTES } from '@nataskium/shared/schemas'
import { type Context, Hono, type MiddlewareHandler } from 'hono'
import { AppError, ServiceBusyError } from '../../../shared/errors'
import type { RateLimiter } from '../../../shared/middleware'
import { imageFileRequired, imageTooLarge } from '../application/imageErrors'
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

export function makeImageRouter(deps: ImageRouterDeps) {
  const router = new Hono()
  const slots = makeUploadSlots(deps.concurrent)
  router.use(deps.requireAuth)

  // Слот занимается до чтения тела и освобождается при любом исходе: 413, обрыв соединения, сбой обработки
  const uploadSlot: MiddlewareHandler = async (c, next) => {
    const release = slots.tryAcquire(c.get('teacherId'))
    if (release === null) throw new ServiceBusyError(UPLOADS_BUSY_RETRY_AFTER_SECONDS)
    try {
      await next()
    } finally {
      release()
    }
  }

  // Обрыв соединения при чтении тела — ошибка клиента, а не 500 с записью в лог
  const limitBody: MiddlewareHandler = async (c, next) => {
    try {
      return await deps.bodyLimit(c, next)
    } catch (error) {
      if (error instanceof AppError) throw error
      throw imageFileRequired()
    }
  }

  router.post(
    '/',
    deps.limiters.perTeacher.middleware((c) => c.get('teacherId')),
    deps.limiters.perIp.middleware(deps.clientIp),
    uploadSlot,
    limitBody,
    async (c) => {
      const file = await readSingleFile(c)
      if (file.size > MAX_IMAGE_UPLOAD_BYTES) throw imageTooLarge()
      const image = await deps.uploadImage(c.get('teacherId'), await file.bytes())
      const response: ImageUploadResponse = { image }
      return c.json(response, CREATED_STATUS)
    },
  )

  return router
}
