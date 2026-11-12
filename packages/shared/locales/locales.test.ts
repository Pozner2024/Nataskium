import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, localizedPath } from './index'

describe('языки интерфейса', () => {
  it('язык по умолчанию входит в список поддерживаемых', () => {
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE)
  })

  it.each([['ru', true], ['en', true], ['de', true], ['fr', true], ['xx', false], ['EN', false], ['', false], [undefined, false], [null, false], [1, false]])(
    'isLocale(%j) — %s',
    (value, expected) => {
      expect(isLocale(value)).toBe(expected)
    },
  )

  it('язык по умолчанию — адрес без префикса', () => {
    expect(localizedPath('ru', '/auth/login')).toBe('/auth/login')
    expect(localizedPath('ru', '/')).toBe('/')
  })

  it('остальные языки — с префиксом', () => {
    expect(localizedPath('en', '/auth/login')).toBe('/en/auth/login')
    expect(localizedPath('en', '/')).toBe('/en')
  })
})
