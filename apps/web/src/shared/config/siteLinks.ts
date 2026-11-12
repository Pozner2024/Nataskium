import { AUTH_PATHS } from './authPaths'
import type { SiteLink } from './types'

// Страниц, кроме главной и входа, пока нет: ссылки на будущие адреса идут через href, иначе роутер ругается
// на несуществующий маршрут. Когда страница появится — заменить href на to
export const SITE_LINKS = {
  home: { labelKey: 'nav.home', to: '/' },
  login: { labelKey: 'nav.login', to: AUTH_PATHS.login },
  register: { labelKey: 'nav.register', to: AUTH_PATHS.register },
  library: { labelKey: 'nav.library', href: '/library' },
  pricing: { labelKey: 'nav.pricing', href: '/pricing' },
  faq: { labelKey: 'nav.faq', href: '/faq' },
  help: { labelKey: 'nav.help', href: '/help' },
  createActivity: { labelKey: 'nav.createActivity', href: '/teacher/activities/new' },
  myActivities: { labelKey: 'nav.myActivities', href: '/teacher/activities' },
  subscription: { labelKey: 'nav.subscription', href: '/teacher/subscription' },
} satisfies Record<string, SiteLink>
