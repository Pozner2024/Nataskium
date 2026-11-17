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
} as const
