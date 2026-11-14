import { describe, expect, it } from 'vitest'
import { GRADING_SCALES, GRADING_SCALE_TYPES, gradeByScale } from './index'

describe('GRADING_SCALES', () => {
  it.each(GRADING_SCALE_TYPES)('шкала %s имеет порог 0, оценка есть при любом проценте', (type) => {
    expect(GRADING_SCALES[type].some(({ minPercent }) => minPercent === 0)).toBe(true)
  })

  it.each([
    [84.99, 'five', '4'],
    [85, 'five', '5'],
    [49.9, 'five', '2'],
    [95, 'ten', '10'],
    [14, 'ten', '1'],
    [59.9, 'letter', 'F'],
    [90, 'letter', 'A'],
  ] as const)('%s%% по шкале %s даёт %s', (percent, type, grade) => {
    expect(gradeByScale(percent, GRADING_SCALES[type])).toBe(grade)
  })
})
