// Разделы кабинета учителя, без языкового префикса. Здесь, а не в web: модуль без Nuxt — его берут и чистые
// функции фронтенда (куда вести после входа), и unit-тесты
export const TEACHER_PAGE_PATHS = {
  activities: '/teacher',
  create: '/teacher/create',
  library: '/teacher/library',
  settings: '/teacher/settings',
} as const
