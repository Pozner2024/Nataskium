import type { ContentfulStatusCode } from 'hono/utils/http-status'

// message уходит клиенту как есть: внутренних деталей в него не класть
export class AppError extends Error {
  readonly status: ContentfulStatusCode

  constructor(status: ContentfulStatusCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.status = status
  }
}
