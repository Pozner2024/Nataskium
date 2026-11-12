import type { SiteLink } from '../config'
import { useI18n, useLocalePath, useNuxtApp } from '#imports'

export interface ResolvedSiteLink {
  label: string
  to?: string
  href?: string
}

const INTERNAL_PATH_PREFIX = '/'
const ROOT_PATH = '/'

// Адрес страницы, которой ещё нет в роутере: localePath для неё вернул бы путь без префикса языка.
// Когда страница появится, ссылку переводят с href на to — тогда префикс ставит localePath
export function useUnroutedPath(): (path: string) => string {
  const { locale } = useI18n()
  const { $i18n } = useNuxtApp()

  return (path) => {
    if (locale.value === $i18n.defaultLocale) return path
    const prefix = `/${locale.value}`
    // Путь мог уже прийти с префиксом, например из ?next=
    if (path === prefix || path.startsWith(`${prefix}/`)) return path
    return path === ROOT_PATH ? prefix : `${prefix}${path}`
  }
}

// Подпись на текущем языке и адрес с префиксом языка. mailto: и внешние адреса остаются как есть
export function useSiteLink(): (link: SiteLink) => ResolvedSiteLink {
  const { t } = useI18n()
  const localePath = useLocalePath()
  const unroutedPath = useUnroutedPath()

  return ({ labelKey, to, href }) => ({
    label: t(labelKey),
    to: to === undefined ? undefined : localePath(to),
    href: href?.startsWith(INTERNAL_PATH_PREFIX) ? unroutedPath(href) : href,
  })
}
