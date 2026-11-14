import { AppError } from '../../../shared/errors'

const NOT_FOUND_STATUS = 404

const CONFLICT_STATUS = 409

export function quizLimitReached(): AppError {
  return new AppError(CONFLICT_STATUS, 'Quiz limit reached')
}

export function quizNotFound(): AppError {
  return new AppError(NOT_FOUND_STATUS, 'Quiz not found')
}
