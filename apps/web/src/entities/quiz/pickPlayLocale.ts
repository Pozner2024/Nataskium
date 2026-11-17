import { type Locale, SUPPORTED_LOCALES } from '@nataskium/shared/locales'

// У страницы игры своя запасная локаль — английский, а не язык сайта по умолчанию
const FALLBACK_LOCALE: Locale = 'en'

export function pickPlayLocale(browserLanguages: readonly string[]): Locale {
  for (const language of browserLanguages) {
    const primary = language.split('-')[0]?.toLowerCase()
    const match = SUPPORTED_LOCALES.find((locale) => locale === primary)
    if (match) return match
  }
  return FALLBACK_LOCALE
}
