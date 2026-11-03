import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { errorHandler, nonErrorHandler, notFoundHandler } from './shared/middleware'

export function createApp(): Hono {
  const app = new Hono()

  app.use(secureHeaders())
  app.use(nonErrorHandler)

  app.onError(errorHandler)
  app.notFound(notFoundHandler)

  app.get('/health', (c) => c.json({ status: 'ok' }))

  return app
}
