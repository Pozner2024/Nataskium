import { TEACHER_PAGE_PATHS } from '@nataskium/shared/routes'
import type { ActivityKind } from '@nataskium/shared/schemas'
import type { TakenActivity } from './types'

const EDIT_PATHS: Record<ActivityKind, string> = {
  quiz: TEACHER_PAGE_PATHS.quizEdit,
  matching: TEACHER_PAGE_PATHS.matchingEdit,
  truefalse: TEACHER_PAGE_PATHS.trueFalseEdit,
}

// Адрес редактора копии без языкового префикса: у каждого типа задания свой редактор
export function takenEditPath(taken: TakenActivity): string {
  return `${EDIT_PATHS[taken.type]}/${taken.quizId}`
}
