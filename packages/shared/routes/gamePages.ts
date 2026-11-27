import { ACTIVITY_KINDS, type ActivityKind } from '../schemas'

// Страницы игр библиотеки, без языкового префикса
const GAME_PAGE_PATHS = {
  // К адресу добавляется /<slug игры>
  type: '/games',
} as const

// Адрес игры в URL; у truefalse slug с дефисом, поэтому он не совпадает с типом
export const GAME_TYPE_SLUGS: Record<ActivityKind, string> = {
  quiz: 'quiz',
  matching: 'matching',
  truefalse: 'true-false',
}

export function gameTypePath(kind: ActivityKind): string {
  return `${GAME_PAGE_PATHS.type}/${GAME_TYPE_SLUGS[kind]}`
}

// Поиск по значениям: ключи объекта (например, '__proto__') не дают ложного совпадения
export function parseGameTypeSlug(slug: string): ActivityKind | null {
  return ACTIVITY_KINDS.find((kind) => GAME_TYPE_SLUGS[kind] === slug) ?? null
}
