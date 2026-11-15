import { z } from 'zod'
import { GRADING_SCALE_TYPES } from '../grading'
import { DEFAULT_GROUP_SLUG, groupSlugSchema } from './library'

export const QUIZ_TITLE_MAX_LENGTH = 100
export const QUESTION_TEXT_MAX_LENGTH = 200
export const OPTION_TEXT_MAX_LENGTH = 60
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 6
export const MIN_QUESTIONS = 1
export const MAX_QUESTIONS = 50
export const MAX_QUIZZES_PER_TEACHER = 100
export const PLAY_VERSION_MAX_LENGTH = 64
export const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024
export const IMAGE_UPLOAD_FIELD = 'file'
// Тексты ошибок API про картинки: по ним фронтенд различает причины с одним статусом 400 (не для показа)
export const IMAGE_TOO_LARGE_REASON = 'File is too large'
export const UNSUPPORTED_IMAGE_REASON = 'Unsupported or corrupted image'
export const UNKNOWN_IMAGE_REASON = 'Unknown image'
// Совпадает с длиной, которую генерирует API: 16 байт → 22 символа base64url без '='
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/

const requiredText = (maxLength: number) =>
  z.string().trim().min(1, 'Text is required').max(maxLength, `Text must be at most ${maxLength} characters`)

// uuid принимается в любом регистре, но id картинок, ключи файлов и их проверка в API — только в нижнем
export const imageIdSchema = z.uuid().toLowerCase()

// Данные шага 1 приходят без imageId — считаем, что картинки нет
const optionalImageIdSchema = imageIdSchema.nullable().default(null)

// Текст варианта может быть пустым, если есть картинка; проверка — в quizQuestionSchema
export const optionSchema = z.object({
  text: z.string().trim().max(OPTION_TEXT_MAX_LENGTH, `Text must be at most ${OPTION_TEXT_MAX_LENGTH} characters`),
  isCorrect: z.boolean(),
  imageId: optionalImageIdSchema,
})

export const optionsSchema = <T extends z.ZodType>(option: T) =>
  z
    .array(option)
    .min(MIN_OPTIONS, `At least ${MIN_OPTIONS} options are required`)
    .max(MAX_OPTIONS, `At most ${MAX_OPTIONS} options are allowed`)

export const quizQuestionSchema = z
  .object({
    text: requiredText(QUESTION_TEXT_MAX_LENGTH),
    imageId: optionalImageIdSchema,
    options: optionsSchema(optionSchema),
  })
  .superRefine((question, ctx) => {
    question.options.forEach((option, index) => {
      if (option.text === '' && option.imageId === null) {
        ctx.addIssue({ code: 'custom', path: ['options', index, 'text'], message: 'Text or image is required' })
      }
    })
    const correctCount = question.options.filter((option) => option.isCorrect).length
    if (correctCount === 0) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'At least one option must be correct' })
    }
    if (correctCount === question.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'At least one option must be incorrect' })
    }
  })

export const quizInputSchema = z
  .object({
    title: requiredText(QUIZ_TITLE_MAX_LENGTH),
    showAnswers: z.boolean(),
    gradingScale: z.enum(GRADING_SCALE_TYPES).nullable(),
    // Раздел библиотеки; старые клиенты без группы попадают в «Разное»
    group: groupSlugSchema.default(DEFAULT_GROUP_SLUG),
    questions: z
      .array(quizQuestionSchema)
      .min(MIN_QUESTIONS, `At least ${MIN_QUESTIONS} question is required`)
      .max(MAX_QUESTIONS, `At most ${MAX_QUESTIONS} questions are allowed`),
  })
  .strict()

export const quizIdSchema = z.uuid()
export const shareTokenSchema = z.string().regex(SHARE_TOKEN_PATTERN, 'Invalid share token')

// Уникальные индексы вариантов; соответствие числу вариантов и selectCount проверяет use-case
const optionIndexesSchema = z
  .array(z.number().int().min(0).max(MAX_OPTIONS - 1))
  .max(MAX_OPTIONS)
  .refine((indexes) => new Set(indexes).size === indexes.length, 'Indexes must be unique')

const versionSchema = z.string().min(1).max(PLAY_VERSION_MAX_LENGTH)

export const playCheckInputSchema = z.object({
  version: versionSchema,
  questionIndex: z.number().int().min(0),
  selected: optionIndexesSchema,
})

export const playFinishInputSchema = z.object({
  version: versionSchema,
  answers: z.array(optionIndexesSchema).max(MAX_QUESTIONS),
})

export type QuizQuestion = z.infer<typeof quizQuestionSchema>
export type QuizInput = z.infer<typeof quizInputSchema>
export type PlayCheckInput = z.infer<typeof playCheckInputSchema>
export type PlayFinishInput = z.infer<typeof playFinishInputSchema>
