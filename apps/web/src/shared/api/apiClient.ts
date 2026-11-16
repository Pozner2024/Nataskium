import { apiErrorResponseSchema } from '@nataskium/shared/schemas'

// Запросы к API — относительные: same-origin в production (Caddy) и в dev (nitro.devProxy)
const API_BASE = '/api'
const NO_CONTENT_STATUS = 204
// Сетевая ошибка или ответ не в ожидаемом формате — статуса HTTP нет или ему нельзя верить
export const NETWORK_ERROR_STATUS = 0
const RETRY_AFTER_HEADER = 'Retry-After'
// Повисший запрос не ждём бесконечно: refresh держит Web Lock, и остальные вкладки ждали бы вместе с ним.
// С запасом над таймаутами API к внешним сервисам (8 с) и сверкой argon2 под нагрузкой
const REQUEST_TIMEOUT_MS = 15_000
// Загрузка файла до 15 МБ с телефона на медленной сети идёт дольше обычного запроса
const UPLOAD_TIMEOUT_MS = 120_000

export type ApiIssue = { path: string[]; message: string }

// Ошибка запроса к API. Текст API (английский и намеренно общий) клиенту не показывается: страница
// выбирает русский текст по status. issues — только у 400 валидации.
// reason — текст API: по нему различают причины с одним статусом («File is too large» / «Unknown image»), не для показа
export class ApiError extends Error {
  readonly status: number
  readonly issues: readonly ApiIssue[]
  readonly retryAfterSeconds: number | null
  readonly reason: string | null

  constructor(status: number, issues: readonly ApiIssue[] = [], retryAfterSeconds: number | null = null, reason: string | null = null) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.issues = issues
    this.retryAfterSeconds = retryAfterSeconds
    this.reason = reason
  }
}

// Достаточно safeParse: схемы Zod из @nataskium/shared ему соответствуют, а web не зависит от zod напрямую
export type ResponseSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  // FormData уходит как есть: Content-Type с boundary браузер ставит сам; остальное — JSON
  body?: unknown
  accessToken?: string | null
  // Для запросов, которые сервер выполняет заведомо дольше обычного (копирование задания с картинками);
  // без неё — REQUEST_TIMEOUT_MS, а для FormData — UPLOAD_TIMEOUT_MS
  timeoutMs?: number
}

function retryAfter(response: Response): number | null {
  const value = Number(response.headers.get(RETRY_AFTER_HEADER))
  return Number.isFinite(value) && value > 0 ? value : null
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
  if (!body.success) return new ApiError(response.status, [], retryAfter(response))
  return new ApiError(response.status, body.data.issues ?? [], retryAfter(response), body.data.error)
}

function requestBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined
  if (body instanceof FormData) return body
  return JSON.stringify(body)
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const isFormData = options.body instanceof FormData
  const headers: Record<string, string> = {}
  if (options.body !== undefined && !isFormData) headers['Content-Type'] = 'application/json'
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'POST',
      headers,
      body: requestBody(options.body),
      // refresh-cookie (HttpOnly, Path=/api/auth) браузер подставит сам
      credentials: 'include',
      signal: AbortSignal.timeout(options.timeoutMs ?? (isFormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS)),
    })
  } catch {
    // Сеть или таймаут — для страницы одно и то же: «нет связи, попробуйте ещё раз»
    throw new ApiError(NETWORK_ERROR_STATUS)
  }

  if (!response.ok) throw await toApiError(response)
  return response
}

// Ответ разбирается схемой из @nataskium/shared, а не принимается на веру
export async function apiRequest<T>(path: string, schema: ResponseSchema<T>, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options)
  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new ApiError(NETWORK_ERROR_STATUS)
  return parsed.data
}

// Для ответов без тела (204)
export async function apiRequestWithoutBody(path: string, options: RequestOptions = {}): Promise<void> {
  const response = await send(path, options)
  if (response.status !== NO_CONTENT_STATUS) await response.body?.cancel()
}
