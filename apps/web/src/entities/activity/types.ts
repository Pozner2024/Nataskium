export type ActivityType = 'quiz' | 'gaps' | 'pictures'

export interface Activity {
  id: string
  title: string
  type: ActivityType
  questionCount: number
  // Название шкалы оценивания; null — учитель решил не ставить оценку
  scaleName: string | null
  shareToken: string
}
