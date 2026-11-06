import { AppError } from './AppError'

const RETRY_AFTER_HEADER = 'Retry-After'

const TOO_MANY_REQUESTS_STATUS = 429
const RATE_LIMITED_MESSAGE = 'Too many attempts, try again later'

// Одно сообщение для всех лимитов: по нему не понять, существует ли email.
export class RateLimitedError extends AppError {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(TOO_MANY_REQUESTS_STATUS, RATE_LIMITED_MESSAGE, { [RETRY_AFTER_HEADER]: String(retryAfterSeconds) })
    this.name = 'RateLimitedError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}
