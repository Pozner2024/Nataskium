import type { GradingScaleType } from '@nataskium/shared/grading'
import type { ActivityKind, IntroThemeKey, LibraryThumbnail } from '@nataskium/shared/schemas'

export type ActivityType = ActivityKind

export interface Activity {
  id: string
  title: string
  type: ActivityType
  questionCount: number
  // Тип шкалы оценивания; null — учитель решил не ставить оценку
  gradingScale: GradingScaleType | null
  shareToken: string
  introTheme: IntroThemeKey
  // null — у задания нет содержимого для превью
  thumbnail: LibraryThumbnail | null
}
