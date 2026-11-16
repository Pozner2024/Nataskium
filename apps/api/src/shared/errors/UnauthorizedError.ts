import { AppError } from './AppError'

const UNAUTHORIZED_STATUS = 401
const UNAUTHORIZED_MESSAGE = 'Unauthorized'
const WWW_AUTHENTICATE = { 'WWW-Authenticate': 'Bearer' }

// Один ответ на нет токена, неверный токен и удалённый аккаунт при ещё действующем токене: по ответу не различить
export class UnauthorizedError extends AppError {
  constructor() {
    super(UNAUTHORIZED_STATUS, UNAUTHORIZED_MESSAGE, WWW_AUTHENTICATE)
    this.name = 'UnauthorizedError'
  }
}
