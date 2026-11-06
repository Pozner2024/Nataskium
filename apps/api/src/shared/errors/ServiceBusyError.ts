import { AppError } from './AppError'

const RETRY_AFTER_HEADER = 'Retry-After'

const SERVICE_UNAVAILABLE_STATUS = 503
const SERVICE_BUSY_MESSAGE = 'Service is busy, try again later'

// Перегрузка, а не ошибка запроса — с заголовком Retry-After
export class ServiceBusyError extends AppError {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(SERVICE_UNAVAILABLE_STATUS, SERVICE_BUSY_MESSAGE, { [RETRY_AFTER_HEADER]: String(retryAfterSeconds) })
    this.name = 'ServiceBusyError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}
