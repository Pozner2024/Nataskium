import { describe, expect, it } from 'vitest'
import { calculatePercent, gradeByScale } from './index'
import type { GradeThreshold } from './index'

const PERCENT_SCALE = 100
// Делители 100: при таких знаменателях процент целый, ожидание считается без деления чисел с плавающей точкой
const DIVISORS_OF_100 = [1, 2, 4, 5, 10, 20, 25, 50, 100]
const MAX_TOTAL_MULTIPLIER = 50

const A: GradeThreshold = { minPercent: 95, label: 'A' }
const B: GradeThreshold = { minPercent: 80, label: 'B' }
const C: GradeThreshold = { minPercent: 60, label: 'C' }
const SCALE = [A, B, C]

const SCALE_PERMUTATIONS = [
  [A, B, C],
  [A, C, B],
  [B, A, C],
  [B, C, A],
  [C, A, B],
  [C, B, A],
]

describe('calculatePercent', () => {
  it('считает процент правильных ответов', () => {
    expect(calculatePercent(3, 4)).toBe(75)
  })

  it('0 из N — это 0%', () => {
    expect(calculatePercent(0, 7)).toBe(0)
  })

  it('N из N — это 100%', () => {
    expect(calculatePercent(7, 7)).toBe(100)
  })

  it('не округляет результат', () => {
    expect(calculatePercent(1, 3)).toBe(100 / 3)
    expect(calculatePercent(2, 3)).toBe(200 / 3)
  })

  it('57 из 100 — ровно 57', () => {
    expect(calculatePercent(57, 100)).toBe(57)
  })

  it('i из 100 — ровно i для всех i от 0 до 100', () => {
    const inexact = Array.from({ length: PERCENT_SCALE + 1 }, (_, i) => i)
      .filter(i => calculatePercent(i, PERCENT_SCALE) !== i)

    expect(inexact).toEqual([])
  })

  it.each([
    [19, 20, 95],
    [7, 25, 28],
    [3, 50, 6],
    [171, 300, 57],
    [1, 8, 12.5],
  ])('%i из %i — ровно %d', (correctCount, totalCount, expected) => {
    expect(calculatePercent(correctCount, totalCount)).toBe(expected)
  })

  it('точен для всех знаменателей, где процент целый', () => {
    const inexact: string[] = []

    for (const divisor of DIVISORS_OF_100) {
      for (let multiplier = 1; multiplier <= MAX_TOTAL_MULTIPLIER; multiplier++) {
        for (let step = 0; step <= divisor; step++) {
          const correctCount = step * multiplier
          const totalCount = divisor * multiplier
          const expected = step * (PERCENT_SCALE / divisor)

          if (calculatePercent(correctCount, totalCount) !== expected) {
            inexact.push(`${correctCount}/${totalCount}`)
          }
        }
      }
    }

    expect(inexact).toEqual([])
  })

  it.each([
    ['ноль', 0, 0],
    ['отрицательный', 1, -1],
    ['нецелый', 1, 2.5],
    ['NaN', 1, Number.NaN],
    ['Infinity', 1, Number.POSITIVE_INFINITY],
  ])('бросает RangeError, если totalCount %s', (_name, correctCount, totalCount) => {
    expect(() => calculatePercent(correctCount, totalCount)).toThrow(RangeError)
  })

  it.each([
    ['отрицательный', -1, 5],
    ['нецелый', 2.5, 5],
    ['NaN', Number.NaN, 5],
    ['Infinity', Number.POSITIVE_INFINITY, 5],
    ['больше totalCount', 6, 5],
  ])('бросает RangeError, если correctCount %s', (_name, correctCount, totalCount) => {
    expect(() => calculatePercent(correctCount, totalCount)).toThrow(RangeError)
  })
})

describe('gradeByScale', () => {
  it.each([
    [95, 'A'],
    [80, 'B'],
    [60, 'C'],
  ])('%d% точно на пороге — оценка %s', (percent, expected) => {
    expect(gradeByScale(percent, SCALE)).toBe(expected)
  })

  it.each([
    [94.9, 'B'],
    [94.99999999999999, 'B'],
    [79.9, 'C'],
    [59.9, null],
  ])('%d% чуть ниже порога — оценка %s', (percent, expected) => {
    expect(gradeByScale(percent, SCALE)).toBe(expected)
  })

  it('процент выше всех порогов — высшая оценка', () => {
    expect(gradeByScale(100, SCALE)).toBe('A')
  })

  it('процент ниже всех порогов — null', () => {
    expect(gradeByScale(0, SCALE)).toBeNull()
  })

  it('0% и 100% попадают на пороги 0 и 100', () => {
    const fullRange = [{ minPercent: 0, label: 'F' }, { minPercent: 100, label: 'S' }]

    expect(gradeByScale(0, fullRange)).toBe('F')
    expect(gradeByScale(100, fullRange)).toBe('S')
  })

  it('пустой список порогов — null', () => {
    expect(gradeByScale(50, [])).toBeNull()
  })

  it.each(SCALE_PERMUTATIONS)('порядок порогов не важен: %j, %j, %j', (...thresholds) => {
    expect(gradeByScale(97, thresholds)).toBe('A')
    expect(gradeByScale(85, thresholds)).toBe('B')
    expect(gradeByScale(60, thresholds)).toBe('C')
    expect(gradeByScale(10, thresholds)).toBeNull()
  })

  it('не мутирует входной массив', () => {
    const thresholds = [C, A, B]

    gradeByScale(85, thresholds)

    expect(thresholds).toEqual([C, A, B])
  })

  it('работает с замороженным массивом', () => {
    const thresholds = Object.freeze([C, A, B])

    expect(gradeByScale(85, thresholds)).toBe('B')
  })

  it('percent = NaN — null', () => {
    expect(gradeByScale(Number.NaN, SCALE)).toBeNull()
  })

  it('пустой label возвращается как пустая строка, а не null', () => {
    expect(gradeByScale(50, [{ minPercent: 0, label: '' }])).toBe('')
  })

  it('при одинаковых minPercent побеждает первый во входе', () => {
    const first = { minPercent: 50, label: 'first' }
    const second = { minPercent: 50, label: 'second' }

    expect(gradeByScale(50, [first, second])).toBe('first')
    expect(gradeByScale(50, [second, first])).toBe('second')
  })
})

describe('calculatePercent + gradeByScale', () => {
  it('оценка на границе порога не занижается погрешностью', () => {
    const scale = [{ minPercent: 57, label: 'pass' }]

    expect(gradeByScale(calculatePercent(57, 100), scale)).toBe('pass')
    expect(gradeByScale(calculatePercent(19, 20), [A])).toBe('A')
  })

  it('на один ответ меньше порога — оценка ниже', () => {
    expect(gradeByScale(calculatePercent(18, 20), SCALE)).toBe('B')
  })
})
