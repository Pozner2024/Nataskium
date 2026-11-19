import { GRADING_SCALE_TYPES } from '@nataskium/shared/grading'
import type { GradingScaleType } from '@nataskium/shared/grading'
import { describe, expect, it } from 'vitest'
import { makeFinishTrueFalse } from '../src/features/play'
import type { PlayableTrueFalse } from '../src/features/play'

const TOKEN = 't'.repeat(22)
const UPDATED_AT = new Date('2026-11-19T10:00:00.000Z')
const VERSION = UPDATED_AT.toISOString()
const MAX_ITEMS = 30

const itemsOf = (count: number) => Array.from({ length: count }, (_, i) => ({ statement: 'Утверждение ' + i, answer: i % 2 === 0 }))

async function finish(count: number, scale: GradingScaleType | null, answers: (boolean | null)[], showAnswers = false) {
  const trueFalse: PlayableTrueFalse = { title: 'Т', showAnswers, gradingScale: scale, timer: { mode: 'none' }, updatedAt: UPDATED_AT, items: itemsOf(count) }
  const run = makeFinishTrueFalse({ trueFalses: { findByShareToken: async () => trueFalse } })
  return run(TOKEN, { version: VERSION, answers })
}

// Первые right ответов верны, остальные неверны (инверсия правильного)
const withRight = (count: number, right: number) => itemsOf(count).map((item, i) => (i < right ? item.answer : !item.answer))

describe('finishTrueFalse: оценка по шкалам настоящим summarizeQuiz', () => {
  it.each([
    [2, 2, 'five', 100, '5'],
    [2, 1, 'five', 50, '3'],
    [2, 0, 'five', 0, '2'],
    [2, 1, 'ten', 50, '5'],
    [2, 1, 'letter', 50, 'F'],
    [3, 2, 'five', 66, '3'],
    [3, 2, 'ten', 66, '7'],
    [3, 2, 'letter', 66, 'D'],
    [3, 1, 'ten', 33, '3'],
    [3, 3, 'letter', 100, 'A'],
    [30, 30, 'ten', 100, '10'],
    [30, 29, 'ten', 96, '10'],
    [30, 28, 'ten', 93, '9'],
    [30, 27, 'letter', 90, 'A'],
    [30, 26, 'letter', 86, 'B'],
    [30, 21, 'five', 70, '4'],
    [30, 20, 'five', 66, '3'],
    [30, 0, 'letter', 0, 'F'],
  ] as const)('%i утв., верных %i, шкала %s: %i %% и оценка %s', async (count, right, scale, percent, grade) => {
    const { result } = await finish(count, scale, withRight(count, right))

    expect(result).toEqual({ percent, grade, correctCount: right, partialCount: 0, totalCount: count })
  })

  it.each([2, 3, MAX_ITEMS])('шкала не выбрана: grade = null при %i утверждениях', async (count) => {
    const { result } = await finish(count, null, withRight(count, count))

    expect(result).toMatchObject({ percent: 100, grade: null, correctCount: count })
  })

  it.each([...GRADING_SCALE_TYPES])('все null: 0 %, correctCount 0, шкала %s — низшая оценка', async (scale) => {
    const lowest = { ten: '1', five: '2', letter: 'F' }[scale]

    const { result } = await finish(MAX_ITEMS, scale, Array.from({ length: MAX_ITEMS }, () => null))

    expect(result).toEqual({ percent: 0, grade: lowest, correctCount: 0, partialCount: 0, totalCount: MAX_ITEMS })
  })

  it('все неверно — тот же результат, что и все null', async () => {
    const wrong = await finish(5, 'five', withRight(5, 0))
    const empty = await finish(5, 'five', Array.from({ length: 5 }, () => null))

    expect(wrong.result).toEqual(empty.result)
  })

  it('showAnswers: все null — review на каждый пункт с correct false и верным answer', async () => {
    const response = await finish(4, 'five', [null, null, null, null], true)

    expect(response.review).toEqual(itemsOf(4).map(({ answer }) => ({ correct: false, answer })))
  })

  it('showAnswers: все верно — review целиком correct true', async () => {
    const response = await finish(MAX_ITEMS, 'ten', withRight(MAX_ITEMS, MAX_ITEMS), true)

    expect(response.review).toHaveLength(MAX_ITEMS)
    expect(response.review?.every((entry) => entry.correct)).toBe(true)
  })
})
