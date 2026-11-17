import { describe, expect, it } from 'vitest'
import { takenEditPath } from './takenEditPath'

describe('takenEditPath', () => {
  it('викторина — редактор викторины', () => {
    expect(takenEditPath({ quizId: 'q1', type: 'quiz' })).toBe('/teacher/quiz/q1')
  })

  it('сопоставление — редактор сопоставления', () => {
    expect(takenEditPath({ quizId: 'm1', type: 'matching' })).toBe('/teacher/matching/m1')
  })
})
