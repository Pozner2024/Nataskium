import { matchingResponseSchema } from '@nataskium/shared/schemas'
import { apiRequest, apiRequestWithoutBody } from '@/shared'
import type { MatchingInput, MatchingResponse } from './types'

// Маршруты кабинета /api/matchings/*. Список — общий с викторинами (quizApi.list). Обновление токена при 401 делает вызывающий виджет
export const matchingApi = {
  get: (id: string, accessToken: string): Promise<MatchingResponse> =>
    apiRequest(`/matchings/${encodeURIComponent(id)}`, matchingResponseSchema, { method: 'GET', accessToken }),

  create: (input: MatchingInput, accessToken: string): Promise<MatchingResponse> =>
    apiRequest('/matchings', matchingResponseSchema, { method: 'POST', body: input, accessToken }),

  update: (id: string, input: MatchingInput, accessToken: string): Promise<MatchingResponse> =>
    apiRequest(`/matchings/${encodeURIComponent(id)}`, matchingResponseSchema, { method: 'PATCH', body: input, accessToken }),

  remove: (id: string, accessToken: string): Promise<void> =>
    apiRequestWithoutBody(`/matchings/${encodeURIComponent(id)}`, { method: 'DELETE', accessToken }),
}
