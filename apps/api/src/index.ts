import { serve } from '@hono/node-server'
import { createApp } from './app'
import { parseEnv, type Env } from './shared/config'

const API_HOST = '127.0.0.1'

function readEnv(): Env {
  try {
    return parseEnv(process.env)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid environment variables')
    process.exit(1)
  }
}

const env = readEnv()

serve({ fetch: createApp().fetch, port: env.API_PORT, hostname: API_HOST }, ({ address, port }) => {
  console.log(`API started on http://${address}:${port}`)
})
