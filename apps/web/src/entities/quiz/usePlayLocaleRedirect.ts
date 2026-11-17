import { navigateTo, useRoute, useSwitchLocalePath } from '#imports'
import { useCurrentLocale } from '@/shared'
import { pickPlayLocale } from './pickPlayLocale'
import { PREVIEW_QUERY, PREVIEW_QUERY_KEY } from './playUrl'

// Язык игры определяет только браузер ученика, для задания любого типа. Вызывать в setup, а redirect —
// в onMounted до загрузки задания: страница игры отрисовывается только в браузере.
// redirect возвращает true, если ушли на адрес другого языка: загружать задание здесь уже не нужно
export function usePlayLocaleRedirect() {
  const route = useRoute()
  const currentLocale = useCurrentLocale()
  const switchLocalePath = useSwitchLocalePath()
  const isPreview = route.query[PREVIEW_QUERY_KEY] === '1'

  async function redirect(): Promise<boolean> {
    const locale = pickPlayLocale(navigator.languages)
    const target = switchLocalePath(locale)
    if (locale === currentLocale.value || target === '') return false
    await navigateTo(isPreview ? `${target}?${PREVIEW_QUERY}` : target, { replace: true })
    return true
  }

  return { isPreview, redirect }
}
