import {
  playActivityResponseSchema,
  playCheckResponseSchema,
  playFinishResponseSchema,
} from '@nataskium/shared/schemas'
import { apiRequest, type PlaySource, playApiPath } from '@/shared'
import type { PlayActivityResponse, PlayCheckInput, PlayCheckResponse, PlayFinishInput, PlayFinishResponse } from './types'

// Публичные маршруты игры /api/play/* и /api/library/play/*: без авторизации, правильных ответов до проверки нет
export const playApi = {
  // Один адрес для задания любого типа: ответ различается по type
  get: (source: PlaySource): Promise<PlayActivityResponse> =>
    apiRequest(playApiPath(source), playActivityResponseSchema, { method: 'GET' }),

  check: (source: PlaySource, input: PlayCheckInput): Promise<PlayCheckResponse> =>
    apiRequest(`${playApiPath(source)}/check`, playCheckResponseSchema, { method: 'POST', body: input }),

  finish: (source: PlaySource, input: PlayFinishInput): Promise<PlayFinishResponse> =>
    apiRequest(`${playApiPath(source)}/finish`, playFinishResponseSchema, { method: 'POST', body: input }),
}
