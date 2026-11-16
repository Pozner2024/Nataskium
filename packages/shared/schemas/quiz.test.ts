import { describe, expect, it } from 'vitest'
import {
  IMAGE_UPLOAD_FIELD,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MAX_TIME_LIMIT_SECONDS,
  MIN_TIME_LIMIT_SECONDS,
  OPTION_TEXT_MAX_LENGTH,
  PLAY_VERSION_MAX_LENGTH,
  QUESTION_TEXT_MAX_LENGTH,
  imageIdSchema,
  imageUploadResponseSchema,
  playCheckInputSchema,
  playFinishInputSchema,
  playQuizResponseSchema,
  quizInputSchema,
  quizResponseSchema,
  quizTimerSchema,
  shareTokenSchema,
  timerFromColumns,
  timerToColumns,
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

describe('таймер задания', () => {
  it('принимает none и stopwatch без секунд и limit с секундами в границах', () => {
    expect(quizTimerSchema.safeParse({ mode: 'none' }).success).toBe(true)
    expect(quizTimerSchema.safeParse({ mode: 'stopwatch' }).success).toBe(true)
    for (const seconds of [MIN_TIME_LIMIT_SECONDS, 600, MAX_TIME_LIMIT_SECONDS]) {
      expect(quizTimerSchema.safeParse({ mode: 'limit', seconds }).success).toBe(true)
    }
  })

  it('отклоняет limit без секунд, вне границ, дробные и строку', () => {
    const invalid = [undefined, MIN_TIME_LIMIT_SECONDS - 1, MAX_TIME_LIMIT_SECONDS + 1, 1.5, '600', null]
    for (const seconds of invalid) {
      expect(quizTimerSchema.safeParse({ mode: 'limit', seconds }).success).toBe(false)
    }
  })

  it('отклоняет секунды вне limit и неизвестный режим', () => {
    expect(quizTimerSchema.safeParse({ mode: 'none', seconds: 600 }).success).toBe(false)
    expect(quizTimerSchema.safeParse({ mode: 'stopwatch', seconds: 600 }).success).toBe(false)
    expect(quizTimerSchema.safeParse({ mode: 'foo' }).success).toBe(false)
  })

  it('без поля timer задание сохраняется без таймера', () => {
    expect(quizInputSchema.parse(quiz()).timer).toEqual({ mode: 'none' })
    expect(quizInputSchema.parse(quiz({ timer: { mode: 'limit', seconds: 900 } })).timer).toEqual({
      mode: 'limit',
      seconds: 900,
    })
    expect(quizInputSchema.safeParse(quiz({ timer: { mode: 'limit' } })).success).toBe(false)
  })

  it('timerToColumns и timerFromColumns взаимно обратны', () => {
    for (const timer of [{ mode: 'none' }, { mode: 'stopwatch' }, { mode: 'limit', seconds: 900 }] as const) {
      const { timerMode, timeLimitSeconds } = timerToColumns(timer)
      expect(timerFromColumns(timerMode, timeLimitSeconds)).toEqual(timer)
    }
    expect(timerToColumns({ mode: 'stopwatch' })).toEqual({ timerMode: 'stopwatch', timeLimitSeconds: null })
  })

  it('timerFromColumns бросает ошибку на недопустимой комбинации колонок', () => {
    expect(() => timerFromColumns('limit', null)).toThrow()
    expect(() => timerFromColumns('none', 600)).toThrow()
    expect(() => timerFromColumns('foo', null)).toThrow()
  })

  it('quizResponseSchema и playQuizResponseSchema требуют timer', () => {
    const base = {
      quiz: { ...quiz(), id: IMAGE_ID, shareToken: 'A'.repeat(22) },
    }
    expect(quizResponseSchema.safeParse(base).success).toBe(false)
    const play = { quiz: { title: 'T', showAnswers: true, version: 'v1', questions: [] } }
    expect(playQuizResponseSchema.safeParse(play).success).toBe(false)
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

const IMAGE_ID = '3f1c2b9e-8a4d-4c6e-9b1a-2d5e7f8a9b0c'
const IMAGE_URL = 'https://storage.yandexcloud.net/bucket/quiz-images/3f1c2b9e-8a4d-4c6e-9b1a-2d5e7f8a9b0c.webp'

describe('картинки в quizInputSchema', () => {
  it('данные шага 1 без imageId проходят и получают null', () => {
    const result = quizInputSchema.safeParse(quiz())
    expect(result.success).toBe(true)
    expect(result.data?.questions[0]?.imageId).toBeNull()
    expect(result.data?.questions[0]?.options.map((option) => option.imageId)).toEqual([null, null])
  })

  it('принимает картинки у вопроса и вариантов', () => {
    const withImages = question({
      imageId: IMAGE_ID,
      options: [
        { text: 'Париж', isCorrect: true, imageId: IMAGE_ID },
        { text: 'Рим', isCorrect: false, imageId: null },
      ],
    })
    const result = quizInputSchema.safeParse(quiz({ questions: [withImages] }))
    expect(result.success).toBe(true)
    expect(result.data?.questions[0]?.imageId).toBe(IMAGE_ID)
    expect(result.data?.questions[0]?.options[0]?.imageId).toBe(IMAGE_ID)
  })

  it('принимает вариант только с картинкой и пустым текстом', () => {
    const imageOnly = question({
      options: [
        { text: '   ', isCorrect: true, imageId: IMAGE_ID },
        { text: 'Рим', isCorrect: false },
      ],
    })
    const result = quizInputSchema.safeParse(quiz({ questions: [imageOnly] }))
    expect(result.success).toBe(true)
    expect(result.data?.questions[0]?.options[0]?.text).toBe('')
  })

  it('отклоняет вариант без текста и без картинки', () => {
    const empty = question({
      options: [
        { text: 'Париж', isCorrect: true },
        { text: '  ', isCorrect: false, imageId: null },
      ],
    })
    const result = quizInputSchema.safeParse(quiz({ questions: [empty] }))
    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]?.path).toEqual(['questions', 0, 'options', 1, 'text'])
    expect(result.error?.issues[0]?.message).toBe('Text or image is required')
  })

  it('отклоняет вопрос с картинкой, но без текста', () => {
    const imageOnlyQuestion = question({ text: '  ', imageId: IMAGE_ID })
    expect(quizInputSchema.safeParse(quiz({ questions: [imageOnlyQuestion] })).success).toBe(false)
  })

  it('отклоняет imageId не в формате uuid', () => {
    expect(quizInputSchema.safeParse(quiz({ questions: [question({ imageId: 'not-uuid' })] })).success).toBe(false)
    const badOption = question({
      options: [
        { text: 'Париж', isCorrect: true, imageId: 'not-uuid' },
        { text: 'Рим', isCorrect: false },
      ],
    })
    expect(quizInputSchema.safeParse(quiz({ questions: [badOption] })).success).toBe(false)
    expect(imageIdSchema.safeParse('not-uuid').success).toBe(false)
    expect(imageIdSchema.safeParse(IMAGE_ID).success).toBe(true)
  })

  it('приводит imageId к нижнему регистру: id картинок и ключи файлов — только в нижнем', () => {
    const upper = IMAGE_ID.toUpperCase()
    expect(imageIdSchema.parse(upper)).toBe(IMAGE_ID.toLowerCase())
    const result = quizInputSchema.parse(quiz({ questions: [question({ imageId: upper })] }))
    expect(result.questions[0]?.imageId).toBe(IMAGE_ID.toLowerCase())
  })
})

describe('картинки в ответах API', () => {
  const responseQuiz = (imageUrl: string | null) => ({
    quiz: {
      ...quiz({
        questions: [
          {
            text: 'Столица Франции?',
            imageId: imageUrl ? IMAGE_ID : null,
            imageUrl,
            options: [
              { text: '', isCorrect: true, imageId: IMAGE_ID, imageUrl: IMAGE_URL },
              { text: 'Рим', isCorrect: false, imageId: null, imageUrl: null },
            ],
          },
        ],
      }),
      id: IMAGE_ID,
      shareToken: 'A'.repeat(22),
      timer: { mode: 'none' },
    },
  })

  it('quizResponseSchema содержит imageId и imageUrl у вопроса и варианта', () => {
    const result = quizResponseSchema.safeParse(responseQuiz(IMAGE_URL))
    expect(result.success).toBe(true)
    expect(result.data?.quiz.questions[0]?.imageUrl).toBe(IMAGE_URL)
    expect(result.data?.quiz.questions[0]?.options[0]).toEqual({ text: '', isCorrect: true, imageId: IMAGE_ID, imageUrl: IMAGE_URL })
    expect(quizResponseSchema.safeParse(responseQuiz(null)).success).toBe(true)
    expect(quizResponseSchema.safeParse(responseQuiz('not-url')).success).toBe(false)
  })

  it('playQuizResponseSchema: варианты — объекты с текстом и imageUrl', () => {
    const play = (options: unknown) => ({
      quiz: {
        title: 'География',
        showAnswers: true,
        version: 'v1',
        timer: { mode: 'none' },
        questions: [{ text: 'Столица Франции?', imageUrl: IMAGE_URL, options, selectCount: 1 }],
      },
    })
    const result = playQuizResponseSchema.safeParse(
      play([
        { text: '', imageUrl: IMAGE_URL },
        { text: 'Рим', imageUrl: null },
      ]),
    )
    expect(result.success).toBe(true)
    expect(result.data?.quiz.questions[0]?.imageUrl).toBe(IMAGE_URL)
    expect(playQuizResponseSchema.safeParse(play(['Париж', 'Рим'])).success).toBe(false)
  })

  it('imageUploadResponseSchema и константы загрузки', () => {
    expect(imageUploadResponseSchema.safeParse({ image: { id: IMAGE_ID, url: IMAGE_URL } }).success).toBe(true)
    expect(imageUploadResponseSchema.safeParse({ image: { id: IMAGE_ID } }).success).toBe(false)
    expect(MAX_IMAGE_UPLOAD_BYTES).toBe(15 * 1024 * 1024)
    expect(IMAGE_UPLOAD_FIELD).toBe('file')
  })
})

describe('запрещённые символы в текстах викторины', () => {
  const withTitle = (title: string) => quiz({ title })
  const withQuestionText = (text: string) => quiz({ questions: [question({ text })] })
  const withOptionText = (text: string) =>
    quiz({ questions: [question({ options: [{ text, isCorrect: true }, { text: 'B', isCorrect: false }] })] })
  const ok = (value: unknown) => quizInputSchema.safeParse(value).success

  it('пропускает кириллицу, латиницу с диакритикой, RTL-письменности, эмодзи и математику', () => {
    const texts = [
      'Тест по географии',
      'Café naïve Zürich ñ',
      'مرحبا بالعالم',
      'שלום עולם',
      '😀 👨‍👩‍👧 日本語',
      'x² ≥ 4, √2 ∑ π',
    ]
    for (const text of texts) {
      expect(ok(withTitle(text)), text).toBe(true)
      expect(ok(withQuestionText(text)), text).toBe(true)
      expect(ok(withOptionText(text)), text).toBe(true)
    }
  })

  it('перенос строки проходит в тексте вопроса, но не в названии и не в варианте', () => {
    expect(ok(withQuestionText('первая\nвторая'))).toBe(true)
    expect(ok(withTitle('a\nb'))).toBe(false)
    expect(ok(withOptionText('a\nb'))).toBe(false)
  })

  it('табуляция и возврат каретки заменяются пробелом, \\r\\n — переводом строки', () => {
    const parsed = quizInputSchema.parse(withQuestionText('a\tb\rc\r\nd'))
    expect(parsed.questions[0]?.text).toBe('a b c\nd')
    expect(quizInputSchema.parse(withTitle('a\tb')).title).toBe('a b')
    expect(ok(withOptionText('a\tb'))).toBe(true)
    expect(ok(withTitle('a\r\nb'))).toBe(false)
  })

  it.each([
    ['нулевой байт', '\u0000'],
    ['BEL', '\u0007'],
    ['U+202E', '\u202E'],
    ['U+2066', '\u2066'],
  ])('отклоняет %s везде, в том числе в тексте вопроса', (_name, char) => {
    expect(ok(withQuestionText(`a${char}b`))).toBe(false)
    expect(ok(withTitle(`a${char}b`))).toBe(false)
    expect(ok(withOptionText(`a${char}b`))).toBe(false)
  })
})
