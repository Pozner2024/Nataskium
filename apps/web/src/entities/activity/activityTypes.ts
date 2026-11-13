import type { ActivityType } from './types'

export type ActivityTypeColor = 'blue' | 'green' | 'orange'

// Порядок — как в выборе типа при создании задания. Подписи — teacher.activityTypes.{type} в переводах
export const ACTIVITY_TYPES: Record<ActivityType, { icon: string; color: ActivityTypeColor }> = {
  quiz: { icon: 'M5 5h14v4H5zM5 15h14v4H5z', color: 'blue' },
  gaps: { icon: 'M4 10h4M10 10h4M16 10h4M4 15h16', color: 'green' },
  pictures: { icon: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01', color: 'orange' },
}

export const ACTIVITY_TYPE_ORDER: ActivityType[] = ['quiz', 'gaps', 'pictures']
