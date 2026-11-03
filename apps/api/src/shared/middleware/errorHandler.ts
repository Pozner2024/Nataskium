import { STATUS_CODES } from 'node:http'
import type { Context, ErrorHandler, MiddlewareHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { routePath } from 'hono/route'
import { AppError } from '../errors'

const INTERNAL_ERROR_MESSAGE = 'Internal Server Error'
const NOT_FOUND_MESSAGE = 'Not Found'
const SERVER_ERROR_STATUS = 500

function shouldLog(error: Error): boolean {
  const isExpected = error instanceof AppError || error instanceof HTTPException
  return !isExpected || error.status >= SERVER_ERROR_STATUS
}

// Через прототип: поля самого экземпляра, включая name и constructor, могут быть заполнены из данных
function getErrorType(error: Error): string {
  const type: unknown = Object.getPrototypeOf(error)?.constructor?.name
  return typeof type === 'string' && type !== '' ? type : 'Error'
}

// Вне разработки стека в логе нет: в нём есть message, а значит возможны данные пользователя.
// routePath — шаблон маршрута; c.req.path логировать нельзя, в нём будет shareToken
function logError(error: Error, c: Context): void {
  const stack = process.env.NODE_ENV === 'development' ? [error.stack] : []
  console.error(getErrorType(error), c.req.method, routePath(c), ...stack)
}

export const errorHandler: ErrorHandler = (error, c) => {
  if (shouldLog(error)) logError(error, c)

  if (error instanceof AppError) {
    return c.json({ error: error.message }, error.status)
  }

  // Текст по статусу, а не error.message: сообщение HTTPException не предназначено для клиента
  if (error instanceof HTTPException) {
    return c.json({ error: STATUS_CODES[error.status] ?? INTERNAL_ERROR_MESSAGE }, error.status)
  }

  return c.json({ error: INTERNAL_ERROR_MESSAGE }, 500)
}

// Hono передаёт в onError только экземпляры Error, остальное пробрасывает мимо него.
// Подключать после secureHeaders, чтобы заголовки остались на ответе
export const nonErrorHandler: MiddlewareHandler = async (c, next) => {
  try {
    await next()
  } catch (thrown) {
    // Настоящий Error здесь только если упал сам errorHandler
    const label = thrown instanceof Error ? 'Error handler failed' : 'Non-Error thrown'
    console.error(label, c.req.method, routePath(c))
    return c.json({ error: INTERNAL_ERROR_MESSAGE }, 500)
  }
}

export const notFoundHandler: NotFoundHandler = (c) => c.json({ error: NOT_FOUND_MESSAGE }, 404)
