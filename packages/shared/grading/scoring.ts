import { calculatePercent, gradeByScale } from './grading'
import { GRADING_SCALES } from './scales'
import type { GradingScaleType } from './scales'

// НОК 1…5: баллы за вопрос остаются целыми при любом числе правильных (их не больше 5, так как неправильный есть всегда)
export const QUESTION_POINTS = 60

export type QuizResult = {
  percent: number
  grade: string | null
  correctCount: number
  partialCount: number
  totalCount: number
}

// selected без дублей; валидация входа — на стороне схемы и use-case
export function scoreQuestion(selected: readonly number[], correct: readonly number[]): number {
  const hits = selected.filter((index) => correct.includes(index)).length
  return (hits * QUESTION_POINTS) / correct.length
}

export function summarizeQuiz(points: readonly number[], scale: GradingScaleType | null): QuizResult {
  const sum = points.reduce((total, value) => total + value, 0)
  const exact = calculatePercent(sum, points.length * QUESTION_POINTS)

  return {
    // Оценка считается по точному проценту, ученику показывается целая часть
    percent: Math.floor(exact),
    grade: scale ? gradeByScale(exact, GRADING_SCALES[scale]) : null,
    correctCount: points.filter((value) => value === QUESTION_POINTS).length,
    partialCount: points.filter((value) => value > 0 && value < QUESTION_POINTS).length,
    totalCount: points.length,
  }
}
