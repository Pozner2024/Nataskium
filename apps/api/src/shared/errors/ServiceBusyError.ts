import { AppError } from './AppError'

const SERVICE_UNAVAILABLE_STATUS = 503
const SERVICE_BUSY_MESSAGE = 'Service is busy, try again later'

// Перегрузка, а не ошибка запроса: errorHandler (часть E) добавит заголовок Retry-After
export class ServiceBusyError extends AppError {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(SERVICE_UNAVAILABLE_STATUS, SERVICE_BUSY_MESSAGE)
    this.name = 'ServiceBusyError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}
