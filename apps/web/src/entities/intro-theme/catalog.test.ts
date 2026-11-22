import { DEFAULT_INTRO_THEME_KEY } from '@nataskium/shared/schemas'
import { describe, expect, it } from 'vitest'
import { findTheme } from './catalog'

describe('каталог тем интро', () => {
  it('находит тему по ключу', () => {
    expect(findTheme('nataskium-day')).toEqual({ key: 'nataskium-day', kind: 'code', tone: 'light', nameKey: 'play.intro.themes.nataskiumDay', startScrim: false })
  })

  it('ночь — тёмная, день — светлый', () => {
    expect(findTheme('nataskium-night').tone).toBe('dark')
    expect(findTheme('nataskium-day').tone).toBe('light')
  })

  it('у тем Nataskium и темы по умолчанию подложки стартового экрана нет', () => {
    expect(findTheme('nataskium-night').startScrim).toBe(false)
    expect(findTheme('nataskium-day').startScrim).toBe(false)
    expect(findTheme(undefined).startScrim).toBe(false)
  })

  it('без темы или с неизвестным ключом отдаёт тему по умолчанию', () => {
    for (const value of [undefined, null, '', 'space', 42]) {
      expect(findTheme(value).key).toBe(DEFAULT_INTRO_THEME_KEY)
    }
  })
})

describe('каталог тем интро: ключи только из кода', () => {
  it('служебные имена объекта не считаются темами', () => {
    for (const value of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(findTheme(value)).toEqual(findTheme(DEFAULT_INTRO_THEME_KEY))
    }
  })
})
