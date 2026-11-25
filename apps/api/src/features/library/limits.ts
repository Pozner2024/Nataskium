// Лимиты публичных маршрутов библиотеки, на IP. Мягкие: за школьным NAT сидит целый класс.
// Поиск — отдельный и строже: запрос с ILIKE дороже обычного списка.
// «Взять себе» — на учителя и на IP, раз в час: копирование картинок нагружает хранилище
const MS_PER_MINUTE = 60 * 1000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MAX_TRACKED_KEYS = 100_000
const GROUPS_PER_MINUTE = 120
const LIST_PER_MINUTE = 120
const SEARCH_PER_MINUTE = 30
const TAKE_PER_TEACHER_PER_HOUR = 30
const TAKE_PER_IP_PER_HOUR = 100

export const LIBRARY_LIMITS = {
  maxTrackedKeys: MAX_TRACKED_KEYS,
  groups: { max: GROUPS_PER_MINUTE, windowMs: MS_PER_MINUTE },
  list: { max: LIST_PER_MINUTE, windowMs: MS_PER_MINUTE },
  search: { max: SEARCH_PER_MINUTE, windowMs: MS_PER_MINUTE },
  take: {
    perTeacher: { max: TAKE_PER_TEACHER_PER_HOUR, windowMs: MS_PER_HOUR },
    perIp: { max: TAKE_PER_IP_PER_HOUR, windowMs: MS_PER_HOUR },
  },
} as const
