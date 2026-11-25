import { playMatchingFinishResponseSchema } from '@nataskium/shared/schemas'
import { apiRequest, type PlaySource, playApiPath } from '@/shared'
import type { PlayMatchingFinishInput, PlayMatchingFinishResponse } from './types'

// Публичный маршрут игры (ссылка учителя или библиотека). Задание загружается общим playApi.get: один адрес для всех типов
export const matchingPlayApi = {
  finish: (source: PlaySource, input: PlayMatchingFinishInput): Promise<PlayMatchingFinishResponse> =>
    apiRequest(`${playApiPath(source)}/matching/finish`, playMatchingFinishResponseSchema, {
      method: 'POST',
      body: input,
    }),
}
