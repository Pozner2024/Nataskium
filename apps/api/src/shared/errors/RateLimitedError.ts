import { AppError } from './AppError'

const TOO_MANY_REQUESTS_STATUS = 429
const RATE_LIMITED_MESSAGE = 'Too many attempts, try again later'

// Одно сообщение для всех лимитов: по нему не понять, существует ли email. Retry-After добавит errorHandler (часть E)
export class RateLimitedError extends AppError {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(TOO_MANY_REQUESTS_STATUS, RATE_LIMITED_MESSAGE)
    this.name = 'RateLimitedError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}
