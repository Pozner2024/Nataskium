import { AppError } from '../../../shared/errors'

const NOT_FOUND_STATUS = 404

// Несуществующее, удалённое, скрытое и непубличное задание, как и неизвестная группа, неотличимы
export function libraryNotFound(): AppError {
  return new AppError(NOT_FOUND_STATUS, 'Not found')
}
