import { describe, expect, it } from 'vitest'
import { newQuestion, newQuiz } from './newQuestion'

describe('newQuestion', () => {
  it('даёт 4 пустых варианта, ровно один верный', () => {
    const question = newQuestion()
    expect(question.options).toHaveLength(4)
    expect(question.options.filter((option) => option.isCorrect)).toHaveLength(1)
    expect(question.options[0]?.isCorrect).toBe(true)
    expect(question.options.every((option) => option.text === '')).toBe(true)
  })
})

describe('newQuiz', () => {
  it('даёт пустое название, один вопрос, ответы показываются, без оценки', () => {
    const quiz = newQuiz()
    expect(quiz.title).toBe('')
    expect(quiz.questions).toHaveLength(1)
    expect(quiz.showAnswers).toBe(true)
    expect(quiz.gradingScale).toBeNull()
    expect(quiz.timer).toEqual({ mode: 'none' })
  })
})

describe('картинки в новом вопросе', () => {
  it('у вопроса и у всех вариантов imageId: null', () => {
    const question = newQuestion()
    expect(question.imageId).toBeNull()
    expect(question.options.every((option) => option.imageId === null)).toBe(true)
  })

  it('вопрос новой викторины тоже без картинок', () => {
    const [question] = newQuiz().questions
    expect(question?.imageId).toBeNull()
    expect(question?.options.every((option) => option.imageId === null)).toBe(true)
  })
})
