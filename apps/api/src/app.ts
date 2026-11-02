import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

export function createApp(): Hono {
  const app = new Hono()

  app.use(secureHeaders())

  app.get('/health', (c) => c.json({ status: 'ok' }))

  return app
}
