import { trueFalseResponseSchema } from '@nataskium/shared/schemas'
import { apiRequest, apiRequestWithoutBody } from '@/shared'
import type { TrueFalseInput, TrueFalseResponse } from './types'

// Маршруты кабинета /api/true-false/*. Список — общий с викторинами (quizApi.list). Обновление токена при 401 делает вызывающий виджет
export const trueFalseApi = {
  get: (id: string, accessToken: string): Promise<TrueFalseResponse> =>
    apiRequest(`/true-false/${encodeURIComponent(id)}`, trueFalseResponseSchema, { method: 'GET', accessToken }),

  create: (input: TrueFalseInput, accessToken: string): Promise<TrueFalseResponse> =>
    apiRequest('/true-false', trueFalseResponseSchema, { method: 'POST', body: input, accessToken }),

  update: (id: string, input: TrueFalseInput, accessToken: string): Promise<TrueFalseResponse> =>
    apiRequest(`/true-false/${encodeURIComponent(id)}`, trueFalseResponseSchema, { method: 'PATCH', body: input, accessToken }),

  remove: (id: string, accessToken: string): Promise<void> =>
    apiRequestWithoutBody(`/true-false/${encodeURIComponent(id)}`, { method: 'DELETE', accessToken }),
}
