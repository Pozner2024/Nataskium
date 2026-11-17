import type { ActivityType } from './types'

export type ActivityTypeColor = 'blue' | 'green' | 'orange' | 'night'

// Порядок — как в выборе типа при создании задания. Подписи — teacher.activityTypes.{type} в переводах
export const ACTIVITY_TYPES: Record<ActivityType, { icon: string; color: ActivityTypeColor }> = {
  quiz: { icon: 'M5 5h14v4H5zM5 15h14v4H5z', color: 'blue' },
  // Две колонки карточек со скрещёнными связями
  matching: { icon: 'M3 5h6v4H3zM3 15h6v4H3zM15 5h6v4h-6zM15 15h6v4h-6zM9 7l6 10M9 17l6-10', color: 'night' },
  gaps: { icon: 'M4 10h4M10 10h4M16 10h4M4 15h16', color: 'green' },
  pictures: { icon: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01', color: 'orange' },
}

export const ACTIVITY_TYPE_ORDER: ActivityType[] = ['quiz', 'matching', 'gaps', 'pictures']
