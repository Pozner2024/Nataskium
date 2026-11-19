import { describe, expect, it, vi } from 'vitest'
import { gradeTrueFalse, makeCheckTrueFalse, makeFinishTrueFalse, makeGetPlayActivity, toPlayTrueFalseResponse } from '../src/features/play'
import type { PlayTrueFalseSource, PlayableTrueFalse } from '../src/features/play'
import { AppError } from '../src/shared/errors'

const TOKEN = 't'.repeat(22)
const UPDATED_AT = new Date('2026-11-19T10:00:00.000Z')
const VERSION = UPDATED_AT.toISOString()
const NOT_FOUND_STATUS = 404
const BAD_REQUEST_STATUS = 400
const CONFLICT_STATUS = 409

const ITEMS = [
  { statement: 'Земля круглая', answer: true },
  { statement: 'Солнце холодное', answer: false },
  { statement: 'Вода мокрая', answer: true },
]

const TRUE_FALSE: PlayableTrueFalse = {
  title: 'Факты',
  showAnswers: true,
  gradingScale: 'five',
  timer: { mode: 'none' },
  updatedAt: UPDATED_AT,
  items: ITEMS,
}

function sourceOf(overrides: Partial<PlayableTrueFalse> = {}): PlayTrueFalseSource & { findByShareToken: ReturnType<typeof vi.fn> } {
  const trueFalse = { ...TRUE_FALSE, ...overrides }
  return { findByShareToken: vi.fn(async (token: string) => (token === TOKEN ? trueFalse : null)) }
}

async function statusOf(promise: Promise<unknown>): Promise<number | null> {
  const error = await promise.then(() => null, (e: unknown) => e)
  return error instanceof AppError ? error.status : null
}

describe('GET: toPlayTrueFalseResponse', () => {
  it('утверждения в порядке учителя и без ключа answer', () => {
    const response = toPlayTrueFalseResponse(TRUE_FALSE)

    expect(response).toEqual({
      type: 'truefalse',
      trueFalse: {
        title: 'Факты',
        showAnswers: true,
        timer: { mode: 'none' },
        version: VERSION,
        statements: ['Земля круглая', 'Солнце холодное', 'Вода мокрая'],
      },
    })
    const body = JSON.stringify(response)
    expect(body).not.toContain('"answer"')
    expect(body).not.toContain('"items"')
  })

  it('makeGetPlayActivity: токен «да/нет» после викторины и сопоставления', async () => {
    const empty = { findByShareToken: vi.fn(async () => null) }
    const trueFalses = sourceOf()
    const get = makeGetPlayActivity({ quizzes: empty, matchings: empty, trueFalses, imageUrl: () => null, shuffle: (items) => [...items] })

    expect((await get(TOKEN)).type).toBe('truefalse')
    expect(empty.findByShareToken).toHaveBeenCalledTimes(2)
  })
})

describe('gradeTrueFalse', () => {
  it('[true,false,true] против [true,true,null] даёт [true,false,false]', () => {
    expect(gradeTrueFalse(ITEMS, [true, true, null])).toEqual([true, false, false])
  })
})

describe('finishTrueFalse', () => {
  const finishWith = (overrides: Partial<PlayableTrueFalse> = {}) => makeFinishTrueFalse({ trueFalses: sourceOf(overrides) })

  it('3 верных из 4 — percent 75, null считается неверным', async () => {
    const items = [...ITEMS, { statement: 'Лёд горячий', answer: false }]
    const { result } = await finishWith({ items })(TOKEN, { version: VERSION, answers: [true, false, true, null] })

    expect(result).toEqual({ percent: 75, grade: '4', correctCount: 3, partialCount: 0, totalCount: 4 })
  })

  it('showAnswers = false: ключа review нет', async () => {
    const response = await finishWith({ showAnswers: false })(TOKEN, { version: VERSION, answers: [true, false, true] })

    expect('review' in response).toBe(false)
  })

  it('showAnswers = true: review[i] = { correct, answer }', async () => {
    const response = await finishWith()(TOKEN, { version: VERSION, answers: [true, true, null] })

    expect(response.review).toEqual([
      { correct: true, answer: true },
      { correct: false, answer: false },
      { correct: false, answer: true },
    ])
  })

  it('длина 2 вместо 3 — 400', async () => {
    expect(await statusOf(finishWith()(TOKEN, { version: VERSION, answers: [true, false] }))).toBe(BAD_REQUEST_STATUS)
  })

  it('устаревшая version — 409', async () => {
    expect(await statusOf(finishWith()(TOKEN, { version: 'old', answers: [true, false, true] }))).toBe(CONFLICT_STATUS)
  })

  it('невалидный токен — 404 без обращения к источнику', async () => {
    const trueFalses = sourceOf()
    const status = await statusOf(makeFinishTrueFalse({ trueFalses })('../etc/passwd', { version: VERSION, answers: [true, false, true] }))

    expect(status).toBe(NOT_FOUND_STATUS)
    expect(trueFalses.findByShareToken).not.toHaveBeenCalled()
  })
})

describe('checkTrueFalse', () => {
  const checkWith = (overrides: Partial<PlayableTrueFalse> = {}) => makeCheckTrueFalse({ trueFalses: sourceOf(overrides) })

  it('showAnswers = false — 404', async () => {
    expect(await statusOf(checkWith({ showAnswers: false })(TOKEN, { version: VERSION, index: 0, answer: true }))).toBe(NOT_FOUND_STATUS)
  })

  it.each([-1, 3])('index %i из 3 — 400', async (index) => {
    expect(await statusOf(checkWith()(TOKEN, { version: VERSION, index, answer: true }))).toBe(BAD_REQUEST_STATUS)
  })

  it('верный и неверный ответ', async () => {
    expect(await checkWith()(TOKEN, { version: VERSION, index: 1, answer: false })).toEqual({ correct: true })
    expect(await checkWith()(TOKEN, { version: VERSION, index: 1, answer: true })).toEqual({ correct: false })
  })

  it('устаревшая version — 409', async () => {
    expect(await statusOf(checkWith()(TOKEN, { version: 'old', index: 0, answer: true }))).toBe(CONFLICT_STATUS)
  })
})
