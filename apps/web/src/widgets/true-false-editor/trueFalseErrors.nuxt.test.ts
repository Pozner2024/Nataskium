import { describe, expect, it } from 'vitest'
import { ANSWER_REQUIRED_MESSAGE } from './store'
import { issueText } from './trueFalseErrors'

const t = (key: string) => key
const ANSWER_KEY = 'items.0.answer'

describe('issueText: ошибка .answer', () => {
  it('собственная метка store при пустом ответе → «выберите ответ»', () => {
    expect(issueText(ANSWER_KEY, { message: ANSWER_REQUIRED_MESSAGE }, t)).toBe('teacher.trueFalseEditor.errors.answerRequired')
  })

  it('неверный тип булева значения от Zod → «выберите ответ»', () => {
    const error = { message: 'Invalid input: expected boolean, received string' }

    expect(issueText(ANSWER_KEY, error, t)).toBe('teacher.trueFalseEditor.errors.answerRequired')
  })

  it('любое другое сообщение на .answer → общая ошибка', () => {
    expect(issueText(ANSWER_KEY, { message: 'Something else from server' }, t)).toBe('teacher.trueFalseEditor.errors.invalid')
  })
})
