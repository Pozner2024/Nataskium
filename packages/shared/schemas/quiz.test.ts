import { describe, expect, it } from 'vitest'
import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  OPTION_TEXT_MAX_LENGTH,
  PLAY_VERSION_MAX_LENGTH,
  QUESTION_TEXT_MAX_LENGTH,
  playCheckInputSchema,
  playFinishInputSchema,
  quizInputSchema,
  shareTokenSchema,
} from './index'

const question = (overrides: Record<string, unknown> = {}) => ({
  text: 'Столица Франции?',
  options: [
    { text: 'Париж', isCorrect: true },
    { text: 'Рим', isCorrect: false },
  ],
  ...overrides,
})

const quiz = (overrides: Record<string, unknown> = {}) => ({
  title: 'География',
  showAnswers: true,
  gradingScale: 'five',
  questions: [question()],
  ...overrides,
})

const options = (count: number, isCorrect: (i: number) => boolean) =>
  Array.from({ length: count }, (_, i) => ({ text: `o${i}`, isCorrect: isCorrect(i) }))

describe('quizInputSchema', () => {
  it('принимает валидную викторину, в том числе без шкалы', () => {
    expect(quizInputSchema.safeParse(quiz()).success).toBe(true)
    expect(quizInputSchema.safeParse(quiz({ gradingScale: null })).success).toBe(true)
  })

  it('отклоняет 0 и 51 вопрос', () => {
    expect(quizInputSchema.safeParse(quiz({ questions: [] })).success).toBe(false)
    const many = Array.from({ length: MAX_QUESTIONS + 1 }, () => question())
    expect(quizInputSchema.safeParse(quiz({ questions: many })).success).toBe(false)
  })

  it('отклоняет 1 и 7 вариантов', () => {
    const one = question({ options: options(1, () => true) })
    const seven = question({ options: options(MAX_OPTIONS + 1, (i) => i === 0) })
    expect(quizInputSchema.safeParse(quiz({ questions: [one] })).success).toBe(false)
    expect(quizInputSchema.safeParse(quiz({ questions: [seven] })).success).toBe(false)
  })

  it('отклоняет вопрос, где все варианты верные или ни одного верного', () => {
    const messages = { true: 'At least one option must be incorrect', false: 'At least one option must be correct' }
    for (const isCorrect of [true, false]) {
      const result = quizInputSchema.safeParse(quiz({ questions: [question({ options: options(3, () => isCorrect) })] }))
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.path).toEqual(['questions', 0, 'options'])
      expect(result.error?.issues[0]?.message).toBe(messages[String(isCorrect) as 'true' | 'false'])
    }
  })

  it('отклоняет пустой по смыслу и слишком длинный текст', () => {
    expect(quizInputSchema.safeParse(quiz({ title: '   ' })).success).toBe(false)
    expect(quizInputSchema.safeParse(quiz({ questions: [question({ text: '  ' })] })).success).toBe(false)
    const longText = question({ text: 'a'.repeat(QUESTION_TEXT_MAX_LENGTH + 1) })
    expect(quizInputSchema.safeParse(quiz({ questions: [longText] })).success).toBe(false)
    const longOption = question({
      options: [
        { text: 'a'.repeat(OPTION_TEXT_MAX_LENGTH + 1), isCorrect: true },
        { text: 'b', isCorrect: false },
      ],
    })
    expect(quizInputSchema.safeParse(quiz({ questions: [longOption] })).success).toBe(false)
  })

  it('отклоняет лишнее поле и неизвестную шкалу', () => {
    expect(quizInputSchema.safeParse(quiz({ extra: 1 })).success).toBe(false)
    expect(quizInputSchema.safeParse(quiz({ gradingScale: 'six' })).success).toBe(false)
  })
})

describe('shareTokenSchema', () => {
  it('принимает 22 символа base64url и отклоняет остальное', () => {
    expect(shareTokenSchema.safeParse('A'.repeat(22)).success).toBe(true)
    expect(shareTokenSchema.safeParse('A'.repeat(21)).success).toBe(false)
    expect(shareTokenSchema.safeParse('A'.repeat(21) + '+').success).toBe(false)
  })
})

describe('схемы игры', () => {
  it('отклоняет дубли в selected и answers', () => {
    expect(playCheckInputSchema.safeParse({ version: 'v', questionIndex: 0, selected: [1, 1] }).success).toBe(false)
    expect(playCheckInputSchema.safeParse({ version: 'v', questionIndex: 0, selected: [0, 1] }).success).toBe(true)
    expect(playFinishInputSchema.safeParse({ version: 'v', answers: [[0], [2, 2]] }).success).toBe(false)
    expect(playFinishInputSchema.safeParse({ version: 'v', answers: [[0], [2, 3]] }).success).toBe(true)
  })

  it('отклоняет отрицательные индексы и пустую версию', () => {
    expect(playCheckInputSchema.safeParse({ version: 'v', questionIndex: -1, selected: [] }).success).toBe(false)
    expect(playCheckInputSchema.safeParse({ version: '', questionIndex: 0, selected: [] }).success).toBe(false)
    expect(playFinishInputSchema.safeParse({ version: 'v', answers: [[-1]] }).success).toBe(false)
  })

  it('ограничивает сверху размеры selected, answers, индексы и version', () => {
    const base = { version: 'v', questionIndex: 0 }
    expect(playCheckInputSchema.safeParse({ ...base, selected: [0, 1, 2, 3, 4, 5, 6] }).success).toBe(false)
    expect(playCheckInputSchema.safeParse({ ...base, selected: [MAX_OPTIONS] }).success).toBe(false)
    expect(playCheckInputSchema.safeParse({ ...base, selected: [MAX_OPTIONS - 1] }).success).toBe(true)
    const tooManyAnswers = Array.from({ length: MAX_QUESTIONS + 1 }, () => [0])
    expect(playFinishInputSchema.safeParse({ version: 'v', answers: tooManyAnswers }).success).toBe(false)
    expect(playFinishInputSchema.safeParse({ version: 'v', answers: tooManyAnswers.slice(1) }).success).toBe(true)
    const longVersion = 'v'.repeat(PLAY_VERSION_MAX_LENGTH + 1)
    expect(playCheckInputSchema.safeParse({ ...base, version: longVersion, selected: [] }).success).toBe(false)
  })
})
