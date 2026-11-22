import { z } from 'zod'
import { introThemeKeySchema } from './introTheme'
import { matchingKey } from './matching'
import { quizIdSchema, quizInputSchema, quizTimerSchema, requiredText, shareTokenSchema, versionSchema } from './quiz'
import { quizResultSchema } from './quizResponses'

// Дублируются в CHECK quizzes_truefalse_items_check
export const MIN_TRUE_FALSE_ITEMS = 2
export const MAX_TRUE_FALSE_ITEMS = 30
export const TRUE_FALSE_STATEMENT_MAX_LENGTH = 200

export const trueFalseItemSchema = z.object({
  statement: requiredText(TRUE_FALSE_STATEMENT_MAX_LENGTH),
  answer: z.boolean(),
})

const trueFalseItemsSchema = z
  .array(trueFalseItemSchema)
  .min(MIN_TRUE_FALSE_ITEMS, `At least ${MIN_TRUE_FALSE_ITEMS} items are required`)
  .max(MAX_TRUE_FALSE_ITEMS, `At most ${MAX_TRUE_FALSE_ITEMS} items are allowed`)
  .superRefine((items, ctx) => {
    const seen = new Set<string>()
    items.forEach((item, index) => {
      const key = matchingKey(item.statement)
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [index, 'statement'], message: 'Duplicate text' })
      seen.add(key)
    })
  })

// Настройки — те же, что у викторины: название, показ ответов, шкала, раздел, таймер
const trueFalseSettingsSchema = quizInputSchema.pick({ title: true, showAnswers: true, gradingScale: true, group: true, timer: true, introTheme: true })

export const trueFalseInputSchema = trueFalseSettingsSchema.extend({ items: trueFalseItemsSchema }).strict()

// Ответ кабинета на create/get/update
export const trueFalseResponseSchema = z.object({
  trueFalse: trueFalseSettingsSchema.extend({
    id: quizIdSchema,
    shareToken: shareTokenSchema,
    timer: quizTimerSchema,
    introTheme: introThemeKeySchema,
    items: z.array(z.object({ statement: z.string(), answer: z.boolean() })).max(MAX_TRUE_FALSE_ITEMS),
  }),
})

// Для ученика: только утверждения, правильных ответов нет (strict не пропустит случайно добавленное поле)
export const playTrueFalseResponseSchema = z.object({
  type: z.literal('truefalse'),
  trueFalse: z
    .object({
      title: z.string(),
      showAnswers: z.boolean(),
      version: z.string().min(1),
      timer: quizTimerSchema,
      introTheme: introThemeKeySchema,
      statements: z.array(z.string()).max(MAX_TRUE_FALSE_ITEMS),
    })
    .strict(),
})

export const playTrueFalseCheckInputSchema = z.object({
  version: versionSchema,
  index: z.number().int().min(0).max(MAX_TRUE_FALSE_ITEMS - 1),
  answer: z.boolean(),
})

export const playTrueFalseCheckResponseSchema = z.object({ correct: z.boolean() })

// answers[i] — ответ на утверждение i, null — не отвечено. Длину проверяет use-case
export const playTrueFalseFinishInputSchema = z.object({
  version: versionSchema,
  answers: z.array(z.boolean().nullable()).max(MAX_TRUE_FALSE_ITEMS),
})

// review приходит только при showAnswers: answer — правильный ответ
export const playTrueFalseFinishResponseSchema = z.object({
  result: quizResultSchema,
  review: z.array(z.object({ correct: z.boolean(), answer: z.boolean() })).max(MAX_TRUE_FALSE_ITEMS).optional(),
})

export type TrueFalseItem = z.infer<typeof trueFalseItemSchema>
export type TrueFalseInput = z.infer<typeof trueFalseInputSchema>
export type TrueFalseResponse = z.infer<typeof trueFalseResponseSchema>
export type PlayTrueFalseResponse = z.infer<typeof playTrueFalseResponseSchema>
export type PlayTrueFalseCheckInput = z.infer<typeof playTrueFalseCheckInputSchema>
export type PlayTrueFalseCheckResponse = z.infer<typeof playTrueFalseCheckResponseSchema>
export type PlayTrueFalseFinishInput = z.infer<typeof playTrueFalseFinishInputSchema>
export type PlayTrueFalseFinishResponse = z.infer<typeof playTrueFalseFinishResponseSchema>
