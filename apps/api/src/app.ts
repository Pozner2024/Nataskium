import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { AppError } from './shared/errors'
import { errorHandler, nonErrorHandler, notFoundHandler } from './shared/middleware'

const MAX_BODY_SIZE_BYTES = 100 * 1024
const PAYLOAD_TOO_LARGE_STATUS = 413

export function createApp(): Hono {
  const app = new Hono()

  // Шаг 5: CORS подключается здесь, первым
  app.use(secureHeaders())
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_SIZE_BYTES,
      onError: () => {
        throw new AppError(PAYLOAD_TOO_LARGE_STATUS, 'Payload Too Large')
      },
    }),
  )
  // Последним перед маршрутами: ловит сбой самого errorHandler
  app.use(nonErrorHandler)

  app.onError(errorHandler)
  app.notFound(notFoundHandler)

  app.get('/health', (c) => c.json({ status: 'ok' }))

  return app
}
