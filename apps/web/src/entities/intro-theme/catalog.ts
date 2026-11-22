import { DEFAULT_INTRO_THEME_KEY, introThemeKeySchema } from '@nataskium/shared/schemas'
import type { IntroThemeEntry, IntroThemeKey } from './types'

// Каталог живёт в коде, а не загружается из хранилища: подмена файла дала бы чужие стили на странице детей (ADR 0015)
const INTRO_THEMES: Record<IntroThemeKey, Omit<IntroThemeEntry, 'key'>> = {
  'nataskium-night': { kind: 'code', tone: 'dark', nameKey: 'play.intro.themes.nataskiumNight', startScrim: false },
  'nataskium-day': { kind: 'code', tone: 'light', nameKey: 'play.intro.themes.nataskiumDay', startScrim: false },
}

// Неизвестный или пустой ключ (тема не выбрана, тему убрали из каталога) — тема по умолчанию
export function findTheme(key: unknown): IntroThemeEntry {
  const parsed = introThemeKeySchema.safeParse(key)
  const themeKey = parsed.success ? parsed.data : DEFAULT_INTRO_THEME_KEY
  return { key: themeKey, ...INTRO_THEMES[themeKey] }
}
