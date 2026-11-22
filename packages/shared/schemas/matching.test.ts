import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_KINDS,
  MATCHING_DEFINITION_MAX_LENGTH,
  MATCHING_TERM_MAX_LENGTH,
  MAX_ACTIVITIES_PER_TEACHER,
  MAX_MATCHING_PAIRS,
  MAX_QUIZZES_PER_TEACHER,
  MIN_MATCHING_PAIRS,
  matchingInputSchema,
  matchingKey,
  matchingResponseSchema,
  playMatchingFinishInputSchema,
  playMatchingFinishResponseSchema,
  playMatchingResponseSchema,
} from './index'

const pairs = (count: number) => Array.from({ length: count }, (_, i) => ({ term: `слово ${i}`, definition: `определение ${i}` }))

const matching = (overrides: Record<string, unknown> = {}) => ({
  title: 'Животные',
  showAnswers: true,
  gradingScale: 'five',
  pairs: pairs(3),
  ...overrides,
})

function issuePaths(input: unknown): string[] {
  const result = matchingInputSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

describe('matchingInputSchema', () => {
  it('настройки по умолчанию как у викторины: раздел «Разное», без таймера', () => {
    const parsed = matchingInputSchema.parse(matching())
    expect(parsed.group).toBe('other')
    expect(parsed.timer).toEqual({ mode: 'none' })
  })

  it(`границы числа пар: ${MIN_MATCHING_PAIRS}–${MAX_MATCHING_PAIRS}`, () => {
    expect(matchingInputSchema.safeParse(matching({ pairs: pairs(MIN_MATCHING_PAIRS - 1) })).success).toBe(false)
    expect(matchingInputSchema.safeParse(matching({ pairs: pairs(MIN_MATCHING_PAIRS) })).success).toBe(true)
    expect(matchingInputSchema.safeParse(matching({ pairs: pairs(MAX_MATCHING_PAIRS) })).success).toBe(true)
    expect(matchingInputSchema.safeParse(matching({ pairs: pairs(MAX_MATCHING_PAIRS + 1) })).success).toBe(false)
  })

  it('длины слова и определения', () => {
    const at = (term: string, definition: string) => matching({ pairs: [{ term, definition }, { term: 'b', definition: 'B' }] })
    expect(matchingInputSchema.safeParse(at('a'.repeat(MATCHING_TERM_MAX_LENGTH), 'A')).success).toBe(true)
    expect(issuePaths(at('a'.repeat(MATCHING_TERM_MAX_LENGTH + 1), 'A'))).toEqual(['pairs.0.term'])
    expect(matchingInputSchema.safeParse(at('a', 'A'.repeat(MATCHING_DEFINITION_MAX_LENGTH))).success).toBe(true)
    expect(issuePaths(at('a', 'A'.repeat(MATCHING_DEFINITION_MAX_LENGTH + 1)))).toEqual(['pairs.0.definition'])
  })

  it('пустая сторона пары отклоняется, пробелы не считаются текстом', () => {
    expect(issuePaths(matching({ pairs: [{ term: '  ', definition: 'A' }, { term: 'b', definition: 'B' }] }))).toEqual(['pairs.0.term'])
    expect(issuePaths(matching({ pairs: [{ term: 'a', definition: '' }, { term: 'b', definition: 'B' }] }))).toEqual(['pairs.0.definition'])
  })

  it('управляющие, bidi-символы и перевод строки отклоняются', () => {
    for (const bad of ['a\u0007', 'a‮b', 'a\nb']) {
      expect(issuePaths(matching({ pairs: [{ term: bad, definition: 'A' }, { term: 'b', definition: 'B' }] }))).toEqual(['pairs.0.term'])
    }
  })

  it('дубль слова без учёта регистра — ошибка на втором вхождении', () => {
    const input = matching({ pairs: [{ term: 'Кот', definition: 'A' }, { term: 'кот', definition: 'B' }] })
    expect(issuePaths(input)).toEqual(['pairs.1.term'])
  })

  it('дубль определения с другими пробелами', () => {
    const input = matching({ pairs: [{ term: 'a', definition: 'домашнее  животное' }, { term: 'b', definition: ' домашнее животное ' }] })
    expect(issuePaths(input)).toEqual(['pairs.1.definition'])
  })

  it('дубль в разных формах Unicode (NFC и NFD)', () => {
    const input = matching({ pairs: [{ term: 'café', definition: 'A' }, { term: 'café', definition: 'B' }] })
    expect(issuePaths(input)).toEqual(['pairs.1.term'])
  })

  it('неразрывный пробел и табуляция в дубле считаются обычным пробелом', () => {
    expect(issuePaths(matching({ pairs: [{ term: 'кот\u00a0мурлыка', definition: 'A' }, { term: 'кот мурлыка', definition: 'B' }] }))).toEqual(['pairs.1.term'])
    expect(issuePaths(matching({ pairs: [{ term: 'a', definition: 'кот\tмурлыка' }, { term: 'b', definition: 'кот мурлыка' }] }))).toEqual(['pairs.1.definition'])
  })

  it('строка из разных пробельных символов — пустая сторона пары', () => {
    expect(issuePaths(matching({ pairs: [{ term: '\u00a0\t ', definition: 'A' }, { term: 'b', definition: 'B' }] }))).toEqual(['pairs.0.term'])
    expect(issuePaths(matching({ pairs: [{ term: 'a', definition: '\u00a0\u2003' }, { term: 'b', definition: 'B' }] }))).toEqual(['pairs.0.definition'])
  })

  it('границы длины считаются после trim: 60 и 200 символов с пробелами по краям проходят', () => {
    const padded = (text: string) => '  ' + text + '  '
    const at = (term: string, definition: string) => matching({ pairs: [{ term, definition }, { term: 'b', definition: 'B' }] })
    expect(matchingInputSchema.safeParse(at(padded('a'.repeat(MATCHING_TERM_MAX_LENGTH)), 'A')).success).toBe(true)
    expect(matchingInputSchema.safeParse(at('a', padded('A'.repeat(MATCHING_DEFINITION_MAX_LENGTH)))).success).toBe(true)
    expect(issuePaths(at('a', padded('A'.repeat(MATCHING_DEFINITION_MAX_LENGTH + 1))))).toEqual(['pairs.0.definition'])
  })

  it('одинаковый текст у слова и определения разных пар допустим', () => {
    expect(matchingInputSchema.safeParse(matching({ pairs: [{ term: 'a', definition: 'b' }, { term: 'b', definition: 'a' }] })).success).toBe(true)
  })

  it('нестроковые стороны пары — ошибка валидации, а не исключение', () => {
    expect(() => matchingInputSchema.safeParse(matching({ pairs: [{ term: 1, definition: 'A' }, { term: 'b', definition: null }] }))).not.toThrow()
    expect(issuePaths(matching({ pairs: [{ term: 1, definition: 'A' }, { term: 'b', definition: null }] }))).toEqual(['pairs.0.term', 'pairs.1.definition'])
  })

  it('лишние поля отклоняются', () => {
    expect(matchingInputSchema.safeParse(matching({ questions: [] })).success).toBe(false)
  })
})

describe('matchingKey', () => {
  it('NFC, trim, схлопнутые пробелы, нижний регистр', () => {
    expect(matchingKey('  Café   Noir ')).toBe('café noir')
  })
  it('неразрывный пробел и табуляция схлопываются в обычный пробел', () => {
    expect(matchingKey('кот\u00a0\tмурлыка')).toBe('кот мурлыка')
  })
})

describe('схемы ответов и игры', () => {
  it('ответ кабинета разбирается', () => {
    const response = {
      matching: {
        ...matchingInputSchema.parse(matching()),
        id: '6f1c2b8e-3d4a-4b5c-9e6f-7a8b9c0d1e2f',
        shareToken: 'abcdefghijklmnopqrstuv',
      },
    }
    expect(matchingResponseSchema.safeParse(response).success).toBe(true)
  })

  it('play-ответ без pairs', () => {
    const response = {
      type: 'matching',
      matching: { title: 'Т', showAnswers: false, version: 'v1', introTheme: 'nataskium-night', timer: { mode: 'none' }, definitions: ['A', 'B'], terms: ['b', 'a'] },
    }
    const parsed = playMatchingResponseSchema.parse(response)
    expect(parsed.matching).not.toHaveProperty('pairs')
  })

  it('finish: null — не отвечено, длина не больше максимума пар', () => {
    expect(playMatchingFinishInputSchema.safeParse({ version: 'v1', answers: ['a', null, null] }).success).toBe(true)
    expect(playMatchingFinishInputSchema.safeParse({ version: 'v1', answers: Array(MAX_MATCHING_PAIRS).fill(null) }).success).toBe(true)
    expect(playMatchingFinishInputSchema.safeParse({ version: 'v1', answers: Array(MAX_MATCHING_PAIRS + 1).fill(null) }).success).toBe(false)
  })

  it('finish: null не считается повтором, ровно 60 символов проходит', () => {
    expect(playMatchingFinishInputSchema.safeParse({ version: 'v1', answers: [null, 'a', null, null, 'b'] }).success).toBe(true)
    expect(playMatchingFinishInputSchema.safeParse({ version: 'v1', answers: ['a'.repeat(MATCHING_TERM_MAX_LENGTH)] }).success).toBe(true)
  })

  it('finish: пустая, слишком длинная строка и повтор слова отклоняются', () => {
    expect(playMatchingFinishInputSchema.safeParse({ version: 'v1', answers: [''] }).success).toBe(false)
    expect(playMatchingFinishInputSchema.safeParse({ version: 'v1', answers: ['a'.repeat(MATCHING_TERM_MAX_LENGTH + 1)] }).success).toBe(false)
    expect(playMatchingFinishInputSchema.safeParse({ version: 'v1', answers: ['a', 'a'] }).success).toBe(false)
    expect(playMatchingFinishInputSchema.safeParse({ version: '', answers: [] }).success).toBe(false)
  })

  it('finish: нестроковый ответ — ошибка валидации, а не исключение', () => {
    expect(() => playMatchingFinishInputSchema.safeParse({ version: 'v1', answers: [1, {}] })).not.toThrow()
    expect(playMatchingFinishInputSchema.safeParse({ version: 'v1', answers: [1, {}] }).success).toBe(false)
    expect(playMatchingFinishInputSchema.safeParse({ version: 'v1', answers: 'a' }).success).toBe(false)
  })

  it('finish-ответ: review необязателен', () => {
    const result = { percent: 50, grade: null, correctCount: 1, partialCount: 0, totalCount: 2 }
    expect(playMatchingFinishResponseSchema.safeParse({ result }).success).toBe(true)
    const review = [{ correct: true, term: 'a' }, { correct: false, term: 'b' }]
    expect(playMatchingFinishResponseSchema.parse({ result, review }).review).toEqual(review)
  })
})

describe('константы', () => {
  it('лимит заданий общий, старое имя — алиас', () => {
    expect(MAX_ACTIVITIES_PER_TEACHER).toBe(100)
    expect(MAX_QUIZZES_PER_TEACHER).toBe(MAX_ACTIVITIES_PER_TEACHER)
    expect(ACTIVITY_KINDS).toEqual(['quiz', 'matching', 'truefalse'])
  })
})
