import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_KINDS,
  MAX_TRUE_FALSE_ITEMS,
  MIN_TRUE_FALSE_ITEMS,
  TRUE_FALSE_ACTIVITY,
  TRUE_FALSE_STATEMENT_MAX_LENGTH,
  playActivityResponseSchema,
  playTrueFalseCheckInputSchema,
  playTrueFalseCheckResponseSchema,
  playTrueFalseFinishInputSchema,
  playTrueFalseFinishResponseSchema,
  playTrueFalseResponseSchema,
  trueFalseInputSchema,
  trueFalseResponseSchema,
} from './index'

const items = (count: number) => Array.from({ length: count }, (_, i) => ({ statement: `утверждение ${i}`, answer: i % 2 === 0 }))

const trueFalse = (overrides: Record<string, unknown> = {}) => ({
  title: 'География',
  showAnswers: true,
  gradingScale: 'five',
  items: items(3),
  ...overrides,
})

function issues(input: unknown) {
  const result = trueFalseInputSchema.safeParse(input)
  return result.success ? [] : result.error.issues
}

describe('trueFalseInputSchema', () => {
  it('тип задания добавлен в список', () => {
    expect(TRUE_FALSE_ACTIVITY).toBe('truefalse')
    expect(ACTIVITY_KINDS).toEqual(['quiz', 'matching', 'truefalse'])
  })

  it('принимает 2 и 30 элементов, отклоняет 1 и 31', () => {
    expect(trueFalseInputSchema.safeParse(trueFalse({ items: items(MIN_TRUE_FALSE_ITEMS) })).success).toBe(true)
    expect(trueFalseInputSchema.safeParse(trueFalse({ items: items(MAX_TRUE_FALSE_ITEMS) })).success).toBe(true)
    expect(trueFalseInputSchema.safeParse(trueFalse({ items: items(MIN_TRUE_FALSE_ITEMS - 1) })).success).toBe(false)
    expect(trueFalseInputSchema.safeParse(trueFalse({ items: items(MAX_TRUE_FALSE_ITEMS + 1) })).success).toBe(false)
  })

  it('отклоняет повтор утверждения с другим регистром и лишними пробелами', () => {
    const found = issues(trueFalse({ items: [{ statement: 'Земля круглая', answer: true }, { statement: '  земля  КРУГЛАЯ ', answer: false }] }))
    expect(found).toHaveLength(1)
    expect(found[0]?.path).toEqual(['items', 1, 'statement'])
    expect(found[0]?.message).toBe('Duplicate text')
  })

  it('отклоняет повтор утверждения, отличающийся формой Unicode', () => {
    const composed = 'caf\xe9'
    const decomposed = composed.normalize('NFD')
    expect(decomposed).not.toBe(composed)
    const found = issues(trueFalse({ items: [{ statement: composed, answer: true }, { statement: decomposed, answer: false }] }))
    expect(found).toHaveLength(1)
    expect(found[0]?.path).toEqual(['items', 1, 'statement'])
    expect(found[0]?.message).toBe('Duplicate text')
  })

  it('отклоняет утверждение длиной 201 и пустое', () => {
    const at = (statement: string) => trueFalse({ items: [{ statement, answer: true }, { statement: 'b', answer: false }] })
    expect(trueFalseInputSchema.safeParse(at('a'.repeat(TRUE_FALSE_STATEMENT_MAX_LENGTH))).success).toBe(true)
    expect(trueFalseInputSchema.safeParse(at('a'.repeat(TRUE_FALSE_STATEMENT_MAX_LENGTH + 1))).success).toBe(false)
    expect(trueFalseInputSchema.safeParse(at('')).success).toBe(false)
    expect(trueFalseInputSchema.safeParse(at('   ')).success).toBe(false)
  })

  it('отклоняет answer не boolean', () => {
    expect(trueFalseInputSchema.safeParse(trueFalse({ items: [{ statement: 'a', answer: 'true' }, { statement: 'b', answer: false }] })).success).toBe(false)
  })
})

describe('play-схемы', () => {
  const play = { type: 'truefalse', trueFalse: { title: 'T', showAnswers: true, version: 'v1', introTheme: 'nataskium-night', timer: { mode: 'none' }, statements: ['a', 'b'] } }

  it('finish: answers допускает null, отклоняет 31 элемент и строки', () => {
    expect(playTrueFalseFinishInputSchema.safeParse({ version: 'v1', answers: [true, null, false] }).success).toBe(true)
    expect(playTrueFalseFinishInputSchema.safeParse({ version: 'v1', answers: Array(MAX_TRUE_FALSE_ITEMS + 1).fill(true) }).success).toBe(false)
    expect(playTrueFalseFinishInputSchema.safeParse({ version: 'v1', answers: ['true'] }).success).toBe(false)
  })

  it('check: index -1 и 30 отклоняются', () => {
    expect(playTrueFalseCheckInputSchema.safeParse({ version: 'v1', index: 0, answer: true }).success).toBe(true)
    expect(playTrueFalseCheckInputSchema.safeParse({ version: 'v1', index: MAX_TRUE_FALSE_ITEMS - 1, answer: true }).success).toBe(true)
    expect(playTrueFalseCheckInputSchema.safeParse({ version: 'v1', index: -1, answer: true }).success).toBe(false)
    expect(playTrueFalseCheckInputSchema.safeParse({ version: 'v1', index: MAX_TRUE_FALSE_ITEMS, answer: true }).success).toBe(false)
  })

  it('playTrueFalseResponseSchema отклоняет лишнее поле answer', () => {
    expect(playTrueFalseResponseSchema.safeParse(play).success).toBe(true)
    expect(playTrueFalseResponseSchema.safeParse({ ...play, trueFalse: { ...play.trueFalse, answer: true } }).success).toBe(false)
  })

  it('trueFalseResponseSchema: ответ кабинета принимается, без shareToken отклоняется', () => {
    const cabinet = {
      id: '3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f60',
      shareToken: 'A'.repeat(22),
      title: 'T',
      showAnswers: true,
      gradingScale: 'five',
      timer: { mode: 'none' },
      introTheme: 'nataskium-day',
      items: [{ statement: 'a', answer: true }, { statement: 'b', answer: false }],
    }
    expect(trueFalseResponseSchema.safeParse({ trueFalse: cabinet }).success).toBe(true)
    const withoutToken = Object.fromEntries(Object.entries(cabinet).filter(([key]) => key !== 'shareToken'))
    expect(trueFalseResponseSchema.safeParse({ trueFalse: withoutToken }).success).toBe(false)
  })

  it('check-ответ: boolean correct принимается, строка отклоняется', () => {
    expect(playTrueFalseCheckResponseSchema.safeParse({ correct: true }).success).toBe(true)
    expect(playTrueFalseCheckResponseSchema.safeParse({ correct: 'yes' }).success).toBe(false)
  })

  it('finish-ответ: review необязателен, но каждый элемент требует answer', () => {
    const result = { percent: 50, grade: null, correctCount: 1, partialCount: 0, totalCount: 2 }
    expect(playTrueFalseFinishResponseSchema.safeParse({ result, review: [{ correct: true, answer: false }] }).success).toBe(true)
    expect(playTrueFalseFinishResponseSchema.safeParse({ result }).success).toBe(true)
    expect(playTrueFalseFinishResponseSchema.safeParse({ result, review: [{ correct: true }] }).success).toBe(false)
  })

  it('playActivityResponseSchema различает truefalse по type', () => {
    expect(playActivityResponseSchema.safeParse(play).success).toBe(true)
  })
})
