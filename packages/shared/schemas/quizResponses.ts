import { z } from 'zod'
import { GRADING_SCALE_TYPES } from '../grading'
import type { QuizResult } from '../grading'
import { quizIdSchema, quizInputSchema, shareTokenSchema } from './quiz'

// Формы ответов /api/quizzes/* и /api/play/*: API выводит из них типы, фронтенд разбирает ими ответ

export const quizSummarySchema = z.object({
  id: quizIdSchema,
  title: z.string(),
  questionCount: z.number().int().min(0),
  gradingScale: z.enum(GRADING_SCALE_TYPES).nullable(),
  shareToken: shareTokenSchema,
})

export const quizListResponseSchema = z.object({
  quizzes: z.array(quizSummarySchema),
})

export const quizResponseSchema = z.object({
  quiz: quizInputSchema.extend({ id: quizIdSchema, shareToken: shareTokenSchema }),
})

// Для ученика: без isCorrect, только число верных ответов в вопросе
export const playQuizResponseSchema = z.object({
  quiz: z.object({
    title: z.string(),
    showAnswers: z.boolean(),
    version: z.string().min(1),
    questions: z.array(
      z.object({
        text: z.string(),
        options: z.array(z.string()),
        selectCount: z.number().int().min(1),
      }),
    ),
  }),
})

export const playCheckResponseSchema = z.object({
  correct: z.array(z.number().int().min(0)),
})

export const quizResultSchema = z.object({
  percent: z.number(),
  grade: z.string().nullable(),
  correctCount: z.number().int().min(0),
  partialCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
}) satisfies z.ZodType<QuizResult>

export const playFinishResponseSchema = z.object({
  result: quizResultSchema,
})

export type QuizSummary = z.infer<typeof quizSummarySchema>
export type QuizListResponse = z.infer<typeof quizListResponseSchema>
export type QuizResponse = z.infer<typeof quizResponseSchema>
export type PlayQuizResponse = z.infer<typeof playQuizResponseSchema>
export type PlayCheckResponse = z.infer<typeof playCheckResponseSchema>
export type PlayFinishResponse = z.infer<typeof playFinishResponseSchema>
