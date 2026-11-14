import { IMAGE_TOO_LARGE_REASON, UNSUPPORTED_IMAGE_REASON } from '@nataskium/shared/schemas'
import { AppError } from '../../../shared/errors'

const BAD_REQUEST_STATUS = 400
const REQUEST_TIMEOUT_STATUS = 408
const SERVICE_UNAVAILABLE_STATUS = 503

// Сообщения различаются: фронтенд показывает «слишком большой» и «не картинка» по-разному
export function imageTooLarge(): AppError {
  return new AppError(BAD_REQUEST_STATUS, IMAGE_TOO_LARGE_REASON)
}

export function unsupportedImage(): AppError {
  return new AppError(BAD_REQUEST_STATUS, UNSUPPORTED_IMAGE_REASON)
}

export function imageFileRequired(): AppError {
  return new AppError(BAD_REQUEST_STATUS, 'Image file is required')
}

export function imageStorageUnavailable(): AppError {
  return new AppError(SERVICE_UNAVAILABLE_STATUS, 'Image storage is unavailable')
}

// Тело загрузки не пришло за отведённое время
export function imageUploadTimedOut(): AppError {
  return new AppError(REQUEST_TIMEOUT_STATUS, 'Image upload timed out')
}
