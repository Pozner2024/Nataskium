import { AppError } from '../../../shared/errors'

const UNAUTHORIZED_STATUS = 401
// Одно сообщение на все причины отказа сессии: нет токена, отозван, истёк, учителя нет
const SESSION_INVALID_MESSAGE = 'Session is invalid or expired, sign in again'

export function sessionInvalid(): AppError {
  return new AppError(UNAUTHORIZED_STATUS, SESSION_INVALID_MESSAGE)
}
