import { ACTIVITY_KINDS } from '@nataskium/shared/schemas'
import type { ActivityType } from './types'

export type ActivityTypeColor = 'blue' | 'green' | 'orange' | 'night'

// Порядок — как в выборе типа при создании задания. Подписи — gameTypes.{type}.name и .description в переводах
export const ACTIVITY_TYPES: Record<ActivityType, { icon: string; color: ActivityTypeColor }> = {
  quiz: { icon: 'M5 5h14v4H5zM5 15h14v4H5z', color: 'blue' },
  // Две колонки карточек со скрещёнными связями
  matching: { icon: 'M3 5h6v4H3zM3 15h6v4H3zM15 5h6v4h-6zM15 15h6v4h-6zM9 7l6 10M9 17l6-10', color: 'night' },
  // Галочка и крестик
  truefalse: { icon: 'M3 8l3 3 5-6M13 5l7 7M20 5l-7 7M4 16h16M4 20h16', color: 'blue' },
}

export const ACTIVITY_TYPE_ORDER: ActivityType[] = [...ACTIVITY_KINDS]
