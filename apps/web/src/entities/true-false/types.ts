import type { TrueFalseInput } from '@nataskium/shared/schemas'

export type {
  PlayTrueFalseCheckInput,
  PlayTrueFalseCheckResponse,
  PlayTrueFalseFinishInput,
  PlayTrueFalseFinishResponse,
  PlayTrueFalseResponse,
  TrueFalseInput,
  TrueFalseItem,
  TrueFalseResponse,
} from '@nataskium/shared/schemas'

// Ответ у нового утверждения не выбран (null): учитель обязан выбрать его сам. На сервер уходит только TrueFalseInput
export type TrueFalseDraftItem = { statement: string; answer: boolean | null }
export type TrueFalseDraft = Omit<TrueFalseInput, 'items'> & { items: TrueFalseDraftItem[] }
