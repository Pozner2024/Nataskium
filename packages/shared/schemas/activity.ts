import { z } from 'zod'

// Типы заданий в колонке quizzes.type; дублируются в CHECK quizzes_type_check
export const ACTIVITY_KINDS = ['quiz', 'matching', 'truefalse'] as const

type ActivityKindLiteral = (typeof ACTIVITY_KINDS)[number]

// Значения колонки quizzes.type для фильтров в репозиториях
export const QUIZ_ACTIVITY = 'quiz' satisfies ActivityKindLiteral
export const MATCHING_ACTIVITY = 'matching' satisfies ActivityKindLiteral
export const TRUE_FALSE_ACTIVITY = 'truefalse' satisfies ActivityKindLiteral

export const activityKindSchema = z.enum(ACTIVITY_KINDS)

export type ActivityKind = z.infer<typeof activityKindSchema>
