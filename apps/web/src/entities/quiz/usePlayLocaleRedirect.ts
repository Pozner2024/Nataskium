import { navigateTo, useSwitchLocalePath } from '#imports'
import { useCurrentLocale } from '@/shared'
import { pickPlayLocale } from './pickPlayLocale'

// Язык игры при открытии задания по ссылке определяет браузер ученика, для задания любого типа.
// Если на страницу пришли переходом внутри сайта (выбрали язык переключателем), выбор не перебивается.
// Вызывать в setup, а redirect — в onMounted до загрузки задания: страница игры отрисовывается только в браузере.
// redirect возвращает true, если ушли на адрес другого языка: загружать задание здесь уже не нужно
function hasInAppReferrer(): boolean {
  const state: unknown = window.history.state
  return typeof state === 'object' && state !== null && 'back' in state && typeof state.back === 'string'
}

export function usePlayLocaleRedirect() {
  const currentLocale = useCurrentLocale()
  const switchLocalePath = useSwitchLocalePath()

  async function redirect(): Promise<boolean> {
    // Vue Router пишет в history.state адрес, откуда пришли (back): он есть у перехода внутри сайта
    // и сохраняется при перезагрузке вкладки; у открытия по ссылке его нет
    if (hasInAppReferrer()) return false
    const locale = pickPlayLocale(navigator.languages)
    const target = switchLocalePath(locale)
    if (locale === currentLocale.value || target === '') return false
    await navigateTo(target, { replace: true })
    return true
  }

  return { redirect }
}
