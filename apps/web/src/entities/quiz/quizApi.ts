import { quizListResponseSchema, quizResponseSchema } from '@nataskium/shared/schemas'
import { apiRequest, apiRequestWithoutBody } from '@/shared'
import type { QuizInput, QuizListResponse, QuizResponse } from './types'

// Маршруты кабинета /api/quizzes/*. Обновление токена при 401 делает вызывающий виджет
export const quizApi = {
  list: (accessToken: string): Promise<QuizListResponse> =>
    apiRequest('/quizzes', quizListResponseSchema, { method: 'GET', accessToken }),

  get: (id: string, accessToken: string): Promise<QuizResponse> =>
    apiRequest(`/quizzes/${encodeURIComponent(id)}`, quizResponseSchema, { method: 'GET', accessToken }),

  create: (input: QuizInput, accessToken: string): Promise<QuizResponse> =>
    apiRequest('/quizzes', quizResponseSchema, { method: 'POST', body: input, accessToken }),

  update: (id: string, input: QuizInput, accessToken: string): Promise<QuizResponse> =>
    apiRequest(`/quizzes/${encodeURIComponent(id)}`, quizResponseSchema, { method: 'PATCH', body: input, accessToken }),

  remove: (id: string, accessToken: string): Promise<void> =>
    apiRequestWithoutBody(`/quizzes/${encodeURIComponent(id)}`, { method: 'DELETE', accessToken }),
}
