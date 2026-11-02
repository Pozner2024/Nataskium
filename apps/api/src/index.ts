import { serve } from '@hono/node-server'
import { createApp } from './app'

const API_PORT = 3001
const API_HOST = '127.0.0.1'

serve({ fetch: createApp().fetch, port: API_PORT, hostname: API_HOST }, ({ address, port }) => {
  console.log(`API started on http://${address}:${port}`)
})
