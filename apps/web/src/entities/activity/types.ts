import type { GradingScaleType } from '@nataskium/shared/grading'

export type ActivityType = 'quiz' | 'matching' | 'gaps' | 'pictures'

export interface Activity {
  id: string
  title: string
  type: ActivityType
  questionCount: number
  // Тип шкалы оценивания; null — учитель решил не ставить оценку
  gradingScale: GradingScaleType | null
  shareToken: string
}
