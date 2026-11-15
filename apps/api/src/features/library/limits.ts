// Лимиты публичных маршрутов библиотеки, на IP. Мягкие: за школьным NAT сидит целый класс.
// Поиск — отдельный и строже: запрос с ILIKE дороже обычного списка
const MS_PER_MINUTE = 60 * 1000
const MAX_TRACKED_KEYS = 100_000
const GROUPS_PER_MINUTE = 120
const LIST_PER_MINUTE = 120
const SEARCH_PER_MINUTE = 30
const QUIZ_PER_MINUTE = 120

export const LIBRARY_LIMITS = {
  maxTrackedKeys: MAX_TRACKED_KEYS,
  groups: { max: GROUPS_PER_MINUTE, windowMs: MS_PER_MINUTE },
  list: { max: LIST_PER_MINUTE, windowMs: MS_PER_MINUTE },
  search: { max: SEARCH_PER_MINUTE, windowMs: MS_PER_MINUTE },
  quiz: { max: QUIZ_PER_MINUTE, windowMs: MS_PER_MINUTE },
} as const
