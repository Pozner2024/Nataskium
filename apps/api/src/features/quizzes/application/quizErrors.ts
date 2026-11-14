import { UNKNOWN_IMAGE_REASON } from '@nataskium/shared/schemas'
import { AppError } from '../../../shared/errors'

const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
const SERVICE_UNAVAILABLE_STATUS = 503

export function quizLimitReached(): AppError {
  return new AppError(CONFLICT_STATUS, 'Quiz limit reached')
}

export function quizNotFound(): AppError {
  return new AppError(NOT_FOUND_STATUS, 'Quiz not found')
}

// Чужая, несуществующая и занятая другой викториной картинка неотличимы
export function unknownImage(): AppError {
  return new AppError(BAD_REQUEST_STATUS, UNKNOWN_IMAGE_REASON)
}

export function duplicateImage(): AppError {
  return new AppError(BAD_REQUEST_STATUS, 'Image is used more than once')
}

export function imageStorageUnavailable(): AppError {
  return new AppError(SERVICE_UNAVAILABLE_STATUS, 'Image storage is unavailable')
}
