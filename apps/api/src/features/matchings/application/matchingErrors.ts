import { AppError } from '../../../shared/errors'

const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409

// Лимит общий с викторинами: тот же статус 409, что у quizLimitReached
export function activityLimitReached(): AppError {
  return new AppError(CONFLICT_STATUS, 'Activity limit reached')
}

export function matchingNotFound(): AppError {
  return new AppError(NOT_FOUND_STATUS, 'Matching not found')
}

export function unknownGroup(): AppError {
  return new AppError(BAD_REQUEST_STATUS, 'Unknown group')
}
