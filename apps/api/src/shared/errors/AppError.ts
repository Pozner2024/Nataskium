import type { ContentfulStatusCode } from 'hono/utils/http-status'

// message уходит клиенту как есть: внутренних деталей в него не класть.
// headers — заголовки ответа об ошибке (Retry-After, WWW-Authenticate), errorHandler переносит их в ответ
export class AppError extends Error {
  readonly status: ContentfulStatusCode
  readonly headers: Readonly<Record<string, string>>

  constructor(status: ContentfulStatusCode, message: string, headers: Record<string, string> = {}) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.headers = headers
  }
}
