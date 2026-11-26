import type { ActivityKind } from '../schemas'

// Разделы кабинета учителя, без языкового префикса. Здесь, а не в web: модуль без Nuxt — его берут и чистые
// функции фронтенда (куда вести после входа), и unit-тесты
export const TEACHER_PAGE_PATHS = {
  activities: '/teacher',
  create: '/teacher/create',
  settings: '/teacher/settings',
  quizNew: '/teacher/quiz/new',
  // К адресу добавляется /<id>
  quizEdit: '/teacher/quiz',
  matchingNew: '/teacher/matching/new',
  // К адресу добавляется /<id>
  matchingEdit: '/teacher/matching',
  trueFalseNew: '/teacher/true-false/new',
  // К адресу добавляется /<id>
  trueFalseEdit: '/teacher/true-false',
} as const

const NEW_ACTIVITY_PATHS: Record<ActivityKind, string> = {
  quiz: TEACHER_PAGE_PATHS.quizNew,
  matching: TEACHER_PAGE_PATHS.matchingNew,
  truefalse: TEACHER_PAGE_PATHS.trueFalseNew,
}

export function newActivityPath(kind: ActivityKind): string {
  return NEW_ACTIVITY_PATHS[kind]
}
