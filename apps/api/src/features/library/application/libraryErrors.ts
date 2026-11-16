import { AppError } from '../../../shared/errors'

const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
const SERVICE_UNAVAILABLE_STATUS = 503

// Несуществующее, удалённое, скрытое и непубличное задание, как и неизвестная группа, неотличимы
export function libraryNotFound(): AppError {
  return new AppError(NOT_FOUND_STATUS, 'Not found')
}

// Тот же 409, что и при создании задания: лимит общий
export function quizLimitReached(): AppError {
  return new AppError(CONFLICT_STATUS, 'Quiz limit reached')
}

export function imageStorageUnavailable(): AppError {
  return new AppError(SERVICE_UNAVAILABLE_STATUS, 'Image storage is unavailable')
}
