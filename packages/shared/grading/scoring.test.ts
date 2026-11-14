import { describe, expect, it } from 'vitest'
import { scoreQuestion, summarizeQuiz } from './index'

describe('scoreQuestion', () => {
  it('полный балл за единственный правильный ответ', () => {
    expect(scoreQuestion([0], [0])).toBe(60)
  })

  it('половина за одну из двух правильных', () => {
    expect(scoreQuestion([0, 2], [0, 1])).toBe(30)
  })

  it('ноль, если правильных нет среди отмеченных', () => {
    expect(scoreQuestion([3], [0, 1, 2])).toBe(0)
  })

  it('целый балл при делении на 3', () => {
    expect(scoreQuestion([0, 1], [0, 1, 2])).toBe(40)
  })
})

describe('summarizeQuiz', () => {
  it('считает процент, оценку и счётчики', () => {
    expect(summarizeQuiz([60, 30, 0], 'five')).toEqual({
      percent: 50,
      grade: '3',
      correctCount: 1,
      partialCount: 1,
      totalCount: 3,
    })
  })

  it('без шкалы оценки нет, процент округляется вниз', () => {
    const result = summarizeQuiz([60, 60, 40], null)
    expect(result.grade).toBeNull()
    expect(result.percent).toBe(88)
  })
})
