import { DEFAULT_LOCALE } from '@nataskium/shared/locales'

export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: DEFAULT_LOCALE,
}))
