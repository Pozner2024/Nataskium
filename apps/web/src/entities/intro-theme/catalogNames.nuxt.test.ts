import { INTRO_THEME_KEYS } from '@nataskium/shared/schemas'
import { describe, expect, it } from 'vitest'
import { useNuxtApp } from '#imports'
import { findTheme } from '@/entities/intro-theme'

// Паритет ключей между языками проверяет locales.test.ts, здесь — что ключ названия темы вообще существует
describe('названия тем интро', () => {
  it('у каждой темы есть название в переводах', () => {
    const { $i18n } = useNuxtApp()
    for (const key of INTRO_THEME_KEYS) {
      expect($i18n.te(findTheme(key).nameKey), key).toBe(true)
    }
  })
})
