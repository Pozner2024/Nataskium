import { AppError, ValidationError } from '../../../shared/errors'

const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409

export function playQuizNotFound(): AppError {
  return new AppError(NOT_FOUND_STATUS, 'Quiz not found')
}

// Учитель изменил викторину, пока ученик играл: ответы относятся к старым вопросам
export function playVersionConflict(): AppError {
  return new AppError(CONFLICT_STATUS, 'Quiz has changed')
}

export function playInvalid(message: string): ValidationError {
  return new ValidationError([{ path: [], message }])
}
