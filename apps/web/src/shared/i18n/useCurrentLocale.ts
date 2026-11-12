import { DEFAULT_LOCALE, type Locale, isLocale } from '@nataskium/shared/locales'
import { type ComputedRef, computed } from 'vue'
import { useI18n } from '#imports'

// Текущий язык сайта как Locale из @nataskium/shared: его принимают схемы API (письма уходят на этом языке)
export function useCurrentLocale(): ComputedRef<Locale> {
  const { locale } = useI18n()
  return computed(() => (isLocale(locale.value) ? locale.value : DEFAULT_LOCALE))
}
