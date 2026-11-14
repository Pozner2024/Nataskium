import {
  playCheckResponseSchema,
  playFinishResponseSchema,
  playQuizResponseSchema,
} from '@nataskium/shared/schemas'
import { apiRequest } from '@/shared'
import type { PlayCheckInput, PlayCheckResponse, PlayFinishInput, PlayFinishResponse, PlayQuizResponse } from './types'

// Публичные маршруты ученика /api/play/*: без авторизации, правильных ответов до проверки нет
export const playApi = {
  get: (token: string): Promise<PlayQuizResponse> =>
    apiRequest(`/play/${encodeURIComponent(token)}`, playQuizResponseSchema, { method: 'GET' }),

  check: (token: string, input: PlayCheckInput): Promise<PlayCheckResponse> =>
    apiRequest(`/play/${encodeURIComponent(token)}/check`, playCheckResponseSchema, { method: 'POST', body: input }),

  finish: (token: string, input: PlayFinishInput): Promise<PlayFinishResponse> =>
    apiRequest(`/play/${encodeURIComponent(token)}/finish`, playFinishResponseSchema, { method: 'POST', body: input }),
}
