import type { SiteLink } from '../config'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, localizedPath } from '@nataskium/shared/locales'
import { useI18n, useLocalePath } from '#imports'
import { useCurrentLocale } from './useCurrentLocale'

export interface ResolvedSiteLink {
  label: string
  to?: string
  href?: string
}

const INTERNAL_PATH_PREFIX = '/'

// Адрес страницы, которой ещё нет в роутере: localePath для неё вернул бы путь без префикса языка.
// Когда страница появится, ссылку переводят с href на to — тогда префикс ставит localePath
// Путь уже с префиксом какого-либо языка, например ?next=/de/teacher со страницы входа на английском:
// второй префикс дал бы /en/de/teacher
function hasLocalePrefix(path: string): boolean {
  return SUPPORTED_LOCALES.some((code) => code !== DEFAULT_LOCALE && (path === `/${code}` || path.startsWith(`/${code}/`)))
}

export function useUnroutedPath(): (path: string) => string {
  const locale = useCurrentLocale()

  return (path) => (hasLocalePrefix(path) ? path : localizedPath(locale.value, path))
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
