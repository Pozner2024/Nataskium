import { z } from 'zod'
import { GRADING_SCALE_TYPES } from '../grading'
import { DEFAULT_GROUP_SLUG, groupSlugSchema } from './library'
import { CONTROL_CHARS_EXCEPT_NEWLINE, hasNoUnsafeChars } from './textChars'

export const QUIZ_TITLE_MAX_LENGTH = 100
export const QUESTION_TEXT_MAX_LENGTH = 200
export const OPTION_TEXT_MAX_LENGTH = 60
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 6
export const MIN_QUESTIONS = 1
export const MAX_QUESTIONS = 50
// Общий лимит на все типы заданий (ADR-0013)
export const MAX_ACTIVITIES_PER_TEACHER = 100
export const MAX_QUIZZES_PER_TEACHER = MAX_ACTIVITIES_PER_TEACHER
export const TIMER_MODES = ['none', 'stopwatch', 'limit'] as const
// Дублируются в CHECK миграции add_quiz_timer (quizzes_time_limit_check)
export const MIN_TIME_LIMIT_SECONDS = 60
export const MAX_TIME_LIMIT_SECONDS = 10800
export const DEFAULT_TIME_LIMIT_SECONDS = 600
export const PLAY_VERSION_MAX_LENGTH = 64
export const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024
export const IMAGE_UPLOAD_FIELD = 'file'
// Тексты ошибок API про картинки: по ним фронтенд различает причины с одним статусом 400 (не для показа)
export const IMAGE_TOO_LARGE_REASON = 'File is too large'
export const UNSUPPORTED_IMAGE_REASON = 'Unsupported or corrupted image'
export const UNKNOWN_IMAGE_REASON = 'Unknown image'
// Совпадает с длиной, которую генерирует API: 16 байт → 22 символа base64url без '='
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/

const INVALID_CHARS_MESSAGE = 'Text contains invalid characters'

// Табуляция и возврат каретки приходят при вставке из таблиц и документов — заменяем, а не отклоняем
const normalizeWhitespace = (text: string) => text.replace(/\r\n/g, '\n').replace(/[\t\r]/g, ' ')

// Контент викторин публичен (библиотека) и виден детям: управляющие и bidi-символы отклоняются.
// allowNewline — только для текста вопроса (textarea)
export const safeText = (maxLength: number, allowNewline = false) =>
  z
    .string()
    .trim()
    .overwrite(normalizeWhitespace)
    .max(maxLength, `Text must be at most ${maxLength} characters`)
    .refine((text) => hasNoUnsafeChars(text, allowNewline ? CONTROL_CHARS_EXCEPT_NEWLINE : undefined), {
      error: INVALID_CHARS_MESSAGE,
    })

export const requiredText = (maxLength: number, allowNewline = false) =>
  z
    .string()
    .trim()
    .overwrite(normalizeWhitespace)
    .min(1, 'Text is required')
    .max(maxLength, `Text must be at most ${maxLength} characters`)
    .refine((text) => hasNoUnsafeChars(text, allowNewline ? CONTROL_CHARS_EXCEPT_NEWLINE : undefined), {
      error: INVALID_CHARS_MESSAGE,
    })

// uuid принимается в любом регистре, но id картинок, ключи файлов и их проверка в API — только в нижнем
export const imageIdSchema = z.uuid().toLowerCase()

// Данные шага 1 приходят без imageId — считаем, что картинки нет
const optionalImageIdSchema = imageIdSchema.nullable().default(null)

// Текст варианта может быть пустым, если есть картинка; проверка — в quizQuestionSchema
export const optionSchema = z.object({
  text: safeText(OPTION_TEXT_MAX_LENGTH),
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
    text: requiredText(QUESTION_TEXT_MAX_LENGTH, true),
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

// Секунды есть только в режиме limit: инвариант выражен формой union и дублируется CHECK в базе
export const quizTimerSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('none') }),
  z.strictObject({ mode: z.literal('stopwatch') }),
  z.strictObject({
    mode: z.literal('limit'),
    seconds: z.number().int().min(MIN_TIME_LIMIT_SECONDS).max(MAX_TIME_LIMIT_SECONDS),
  }),
])

export type QuizTimer = z.infer<typeof quizTimerSchema>

export const timerFromColumns = (mode: string, seconds: number | null): QuizTimer =>
  quizTimerSchema.parse(mode === 'limit' ? { mode, seconds } : { mode, ...(seconds === null ? {} : { seconds }) })

export const timerToColumns = (timer: QuizTimer): { timerMode: QuizTimer['mode']; timeLimitSeconds: number | null } => ({
  timerMode: timer.mode,
  timeLimitSeconds: timer.mode === 'limit' ? timer.seconds : null,
})

export const quizInputSchema = z
  .object({
    title: requiredText(QUIZ_TITLE_MAX_LENGTH),
    showAnswers: z.boolean(),
    gradingScale: z.enum(GRADING_SCALE_TYPES).nullable(),
    // Раздел библиотеки; старые клиенты без группы попадают в «Разное»
    group: groupSlugSchema.default(DEFAULT_GROUP_SLUG),
    // Старые клиенты без поля сохраняют задание без таймера
    timer: quizTimerSchema.default({ mode: 'none' }),
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

export const versionSchema = z.string().min(1).max(PLAY_VERSION_MAX_LENGTH)

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
