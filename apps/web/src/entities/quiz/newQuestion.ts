import type { QuizInput, QuizQuestion } from './types'

const NEW_QUESTION_OPTIONS_COUNT = 4

// Первый вариант верный: вопрос сразу проходит проверку «хотя бы один верный и один неверный»
export function newQuestion(): QuizQuestion {
  return {
    text: '',
    options: Array.from({ length: NEW_QUESTION_OPTIONS_COUNT }, (_, index) => ({ text: '', isCorrect: index === 0 })),
  }
}

export function newQuiz(): QuizInput {
  return { title: '', showAnswers: true, gradingScale: null, questions: [newQuestion()] }
}
