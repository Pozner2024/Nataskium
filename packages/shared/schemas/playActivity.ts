import { z } from 'zod'
import { playMatchingResponseSchema } from './matching'
import { playQuizResponseSchema } from './quizResponses'
import { playTrueFalseResponseSchema } from './trueFalse'

// Ответ GET /api/play/:token для задания любого типа. Отдельный файл: в activity.ts он дал бы цикл activity → matching → quiz → library → activity
export const playActivityResponseSchema = z.discriminatedUnion('type', [playQuizResponseSchema, playMatchingResponseSchema, playTrueFalseResponseSchema])

export type PlayActivityResponse = z.infer<typeof playActivityResponseSchema>
