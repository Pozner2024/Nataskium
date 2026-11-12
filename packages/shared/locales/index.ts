// Языки интерфейса — одно место для web и API: web берёт отсюда список для nuxt-i18n, API — язык писем
// и адреса страниц с префиксом языка. Новый язык: добавить код сюда, затем файл переводов в web и шаблоны писем в API
// Порядок — порядок в переключателе языка. Язык по умолчанию от него не зависит: он задан в DEFAULT_LOCALE
export const SUPPORTED_LOCALES = ['en', 'ru', 'de', 'fr'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
// Язык без префикса в адресе (strategy prefix_except_default в web)
export const DEFAULT_LOCALE: Locale = 'ru'

export function isLocale(value: unknown): value is Locale {
  return SUPPORTED_LOCALES.some((locale) => locale === value)
}

// Страница сайта на нужном языке: язык по умолчанию — без префикса, остальные — /en/auth/login
export function localizedPath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}
