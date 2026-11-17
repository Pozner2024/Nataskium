import { TEACHER_PAGE_PATHS } from '@nataskium/shared/routes'
import type { TakenActivity } from './types'

// Адрес редактора копии без языкового префикса: у каждого типа задания свой редактор
export function takenEditPath(taken: TakenActivity): string {
  const base = taken.type === 'matching' ? TEACHER_PAGE_PATHS.matchingEdit : TEACHER_PAGE_PATHS.quizEdit
  return `${base}/${taken.quizId}`
}
