import { describe, expect, it } from 'vitest'
import { DEFAULT_INTRO_THEME_KEY, INTRO_THEME_KEYS, introThemeKeySchema } from './introTheme'

describe('introThemeKeySchema', () => {
  it('принимает каждый ключ из списка тем', () => {
    for (const key of INTRO_THEME_KEYS) expect(introThemeKeySchema.safeParse(key).success).toBe(true)
  })

  it('отклоняет неизвестный ключ, другой регистр, пустую строку и не строку', () => {
    for (const value of ['space', 'Nataskium-Night', '', ' nataskium-night', null, 1]) {
      expect(introThemeKeySchema.safeParse(value).success).toBe(false)
    }
  })

  it('тема по умолчанию есть в списке', () => {
    expect(INTRO_THEME_KEYS).toContain(DEFAULT_INTRO_THEME_KEY)
  })
})
