import { z } from 'zod'
import { quizIdSchema, quizInputSchema, quizTimerSchema, requiredText, shareTokenSchema, versionSchema } from './quiz'
import { playQuizResponseSchema, quizResultSchema } from './quizResponses'

// Дублируются в CHECK quizzes_matching_pairs_check (ADR-0013)
export const MIN_MATCHING_PAIRS = 2
export const MAX_MATCHING_PAIRS = 10
export const MATCHING_TERM_MAX_LENGTH = 60
export const MATCHING_DEFINITION_MAX_LENGTH = 200

// Ученик отвечает текстом слова, поэтому слова (и определения) должны различаться не только регистром и пробелами.
// toLowerCase — упрощение вместо полного case-fold (Straße ≠ STRASSE): защиты хватает, ответ сравнивается по точному тексту
export const matchingKey = (text: string): string => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()

export const matchingPairSchema = z.object({
  term: requiredText(MATCHING_TERM_MAX_LENGTH),
  definition: requiredText(MATCHING_DEFINITION_MAX_LENGTH),
})

const matchingPairsSchema = z
  .array(matchingPairSchema)
  .min(MIN_MATCHING_PAIRS, `At least ${MIN_MATCHING_PAIRS} pairs are required`)
  .max(MAX_MATCHING_PAIRS, `At most ${MAX_MATCHING_PAIRS} pairs are allowed`)
  .superRefine((pairs, ctx) => {
    for (const field of ['term', 'definition'] as const) {
      const seen = new Set<string>()
      pairs.forEach((pair, index) => {
        const key = matchingKey(pair[field])
        if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [index, field], message: 'Duplicate text' })
        seen.add(key)
      })
    }
  })

// Настройки — те же, что у викторины: название, показ ответов, шкала, раздел, таймер
const matchingSettingsSchema = quizInputSchema.pick({ title: true, showAnswers: true, gradingScale: true, group: true, timer: true })

export const matchingInputSchema = matchingSettingsSchema.extend({ pairs: matchingPairsSchema }).strict()

// Ответ кабинета на create/get/update
export const matchingResponseSchema = z.object({
  matching: matchingSettingsSchema.extend({
    id: quizIdSchema,
    shareToken: shareTokenSchema,
    timer: quizTimerSchema,
    pairs: z.array(z.object({ term: z.string(), definition: z.string() })).max(MAX_MATCHING_PAIRS),
  }),
})

// Для ученика: определения в порядке учителя, слова перемешаны сервером — связи пар в ответе нет
export const playMatchingResponseSchema = z.object({
  type: z.literal('matching'),
  matching: z.object({
    title: z.string(),
    showAnswers: z.boolean(),
    version: z.string().min(1),
    timer: quizTimerSchema,
    definitions: z.array(z.string()).max(MAX_MATCHING_PAIRS),
    terms: z.array(z.string()).max(MAX_MATCHING_PAIRS),
  }),
})

// Ответ GET /api/play/:token для задания любого типа
export const playActivityResponseSchema = z.discriminatedUnion('type', [playQuizResponseSchema, playMatchingResponseSchema])

// answers[i] — текст слова для определения i, null — не отвечено. Длину и набор слов проверяет use-case
export const playMatchingFinishInputSchema = z.object({
  version: versionSchema,
  answers: z
    .array(z.string().min(1).max(MATCHING_TERM_MAX_LENGTH).nullable())
    .max(MAX_MATCHING_PAIRS)
    .refine((answers) => {
      const given = answers.filter((answer) => answer !== null)
      return new Set(given).size === given.length
    }, 'Terms must be unique'),
})

// review приходит только при showAnswers: правильное слово для каждого определения
export const playMatchingFinishResponseSchema = z.object({
  result: quizResultSchema,
  review: z.array(z.object({ correct: z.boolean(), term: z.string() })).max(MAX_MATCHING_PAIRS).optional(),
})

export type MatchingPair = z.infer<typeof matchingPairSchema>
export type MatchingInput = z.infer<typeof matchingInputSchema>
export type MatchingResponse = z.infer<typeof matchingResponseSchema>
export type PlayMatchingResponse = z.infer<typeof playMatchingResponseSchema>
export type PlayActivityResponse = z.infer<typeof playActivityResponseSchema>
export type PlayMatchingFinishInput = z.infer<typeof playMatchingFinishInputSchema>
export type PlayMatchingFinishResponse = z.infer<typeof playMatchingFinishResponseSchema>
