import { playTrueFalseCheckResponseSchema, playTrueFalseFinishResponseSchema } from '@nataskium/shared/schemas'
import { apiRequest } from '@/shared'
import type {
  PlayTrueFalseCheckInput,
  PlayTrueFalseCheckResponse,
  PlayTrueFalseFinishInput,
  PlayTrueFalseFinishResponse,
} from './types'

// Публичные маршруты ученика. Задание загружается общим playApi.get: одна ссылка для всех типов
export const trueFalsePlayApi = {
  check: (token: string, input: PlayTrueFalseCheckInput): Promise<PlayTrueFalseCheckResponse> =>
    apiRequest(`/play/${encodeURIComponent(token)}/true-false/check`, playTrueFalseCheckResponseSchema, {
      method: 'POST',
      body: input,
    }),

  finish: (token: string, input: PlayTrueFalseFinishInput): Promise<PlayTrueFalseFinishResponse> =>
    apiRequest(`/play/${encodeURIComponent(token)}/true-false/finish`, playTrueFalseFinishResponseSchema, {
      method: 'POST',
      body: input,
    }),
}
