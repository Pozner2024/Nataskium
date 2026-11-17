import { playMatchingFinishResponseSchema } from '@nataskium/shared/schemas'
import { apiRequest } from '@/shared'
import type { PlayMatchingFinishInput, PlayMatchingFinishResponse } from './types'

// Публичный маршрут ученика. Задание загружается общим playApi.get: одна ссылка для всех типов
export const matchingPlayApi = {
  finish: (token: string, input: PlayMatchingFinishInput): Promise<PlayMatchingFinishResponse> =>
    apiRequest(`/play/${encodeURIComponent(token)}/matching/finish`, playMatchingFinishResponseSchema, {
      method: 'POST',
      body: input,
    }),
}
