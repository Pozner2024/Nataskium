import { z } from 'zod'

// Темы интро (ADR 0015). Тему задания выбирает учитель, ключ хранится в задании и проверяется на сервере
export const INTRO_THEME_KEYS = ['nataskium-night', 'nataskium-day'] as const

export const introThemeKeySchema = z.enum(INTRO_THEME_KEYS)

export type IntroThemeKey = z.infer<typeof introThemeKeySchema>

// Играет, если учитель тему не выбрал или ключ неизвестен
export const DEFAULT_INTRO_THEME_KEY: IntroThemeKey = 'nataskium-night'
