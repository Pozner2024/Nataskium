import type { GradingScaleType } from '@nataskium/shared/grading'
import type { IntroThemeKey, QuizTimer } from '@nataskium/shared/schemas'

export type ActivitySettingsValue = {
  group: string
  showAnswers: boolean
  gradingScale: GradingScaleType | null
  timer: QuizTimer
  introTheme: IntroThemeKey
}

// Сохраняет изменённые поля; false — сохранить не удалось, форма возвращает своё состояние
export type SaveActivitySettings = (patch: Partial<ActivitySettingsValue>) => Promise<boolean>
