import { describe, expect, it } from 'vitest'
import { formatLibraryDate } from './formatLibraryDate'

const ISO_DATE = '2026-11-15T10:00:00.000Z'

describe('formatLibraryDate', () => {
  it.each(['ru', 'en', 'de', 'fr'])('форматирует дату для языка %s', (locale) => {
    const formatted = formatLibraryDate(ISO_DATE, locale)

    expect(formatted).not.toBe('')
    expect(formatted).toContain('2026')
  })

  it('дата в разных языках записывается по-разному', () => {
    expect(formatLibraryDate(ISO_DATE, 'ru')).not.toBe(formatLibraryDate(ISO_DATE, 'en'))
  })

  it('битая строка даёт пустую дату, а не исключение', () => {
    expect(formatLibraryDate('не дата', 'ru')).toBe('')
  })
})
