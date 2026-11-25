import { playTrueFalseCheckResponseSchema, playTrueFalseFinishResponseSchema } from '@nataskium/shared/schemas'
import { apiRequest, type PlaySource, playApiPath } from '@/shared'
import type {
  PlayTrueFalseCheckInput,
  PlayTrueFalseCheckResponse,
  PlayTrueFalseFinishInput,
  PlayTrueFalseFinishResponse,
} from './types'

// Публичные маршруты игры (ссылка учителя или библиотека). Задание загружается общим playApi.get: один адрес для всех типов
export const trueFalsePlayApi = {
  check: (source: PlaySource, input: PlayTrueFalseCheckInput): Promise<PlayTrueFalseCheckResponse> =>
    apiRequest(`${playApiPath(source)}/true-false/check`, playTrueFalseCheckResponseSchema, {
      method: 'POST',
      body: input,
    }),

  finish: (source: PlaySource, input: PlayTrueFalseFinishInput): Promise<PlayTrueFalseFinishResponse> =>
    apiRequest(`${playApiPath(source)}/true-false/finish`, playTrueFalseFinishResponseSchema, {
      method: 'POST',
      body: input,
    }),
}
