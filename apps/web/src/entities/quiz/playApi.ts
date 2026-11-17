import {
  playActivityResponseSchema,
  playCheckResponseSchema,
  playFinishResponseSchema,
} from '@nataskium/shared/schemas'
import { apiRequest } from '@/shared'
import type { PlayActivityResponse, PlayCheckInput, PlayCheckResponse, PlayFinishInput, PlayFinishResponse } from './types'

// Публичные маршруты ученика /api/play/*: без авторизации, правильных ответов до проверки нет
export const playApi = {
  // Одна ссылка для задания любого типа: ответ различается по type
  get: (token: string): Promise<PlayActivityResponse> =>
    apiRequest(`/play/${encodeURIComponent(token)}`, playActivityResponseSchema, { method: 'GET' }),

  check: (token: string, input: PlayCheckInput): Promise<PlayCheckResponse> =>
    apiRequest(`/play/${encodeURIComponent(token)}/check`, playCheckResponseSchema, { method: 'POST', body: input }),

  finish: (token: string, input: PlayFinishInput): Promise<PlayFinishResponse> =>
    apiRequest(`/play/${encodeURIComponent(token)}/finish`, playFinishResponseSchema, { method: 'POST', body: input }),
}
