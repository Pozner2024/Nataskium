import { DEFAULT_LOCALE, type Locale, isLocale } from '@nataskium/shared/locales'
import { type ComputedRef, computed } from 'vue'
import { useNuxtApp } from '#imports'

// Текущий язык сайта как Locale из @nataskium/shared: его принимают схемы API (письма уходят на этом языке).
// Глобальный $i18n, а не useI18n: useI18n работает только в setup компонента, а это вызывают и route middleware
export function useCurrentLocale(): ComputedRef<Locale> {
  const { $i18n } = useNuxtApp()
  return computed(() => (isLocale($i18n.locale.value) ? $i18n.locale.value : DEFAULT_LOCALE))
}
