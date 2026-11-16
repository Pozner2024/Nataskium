import { LIBRARY_PAGE_PATHS } from '@nataskium/shared/routes'
import { AUTH_PATHS } from './authPaths'
import { TEACHER_PATHS } from './teacherPaths'
import type { SiteLink } from './types'

// Страниц, кроме главной, входа, библиотеки и кабинета учителя, пока нет: ссылки на будущие адреса идут через href, иначе роутер ругается
// на несуществующий маршрут. Когда страница появится — заменить href на to
export const SITE_LINKS = {
  home: { labelKey: 'nav.home', to: '/' },
  login: { labelKey: 'nav.login', to: AUTH_PATHS.login },
  register: { labelKey: 'nav.register', to: AUTH_PATHS.register },
  library: { labelKey: 'nav.library', to: LIBRARY_PAGE_PATHS.root },
  pricing: { labelKey: 'nav.pricing', href: '/pricing' },
  faq: { labelKey: 'nav.faq', href: '/faq' },
  help: { labelKey: 'nav.help', href: '/help' },
  createActivity: { labelKey: 'nav.createActivity', to: TEACHER_PATHS.create },
  myActivities: { labelKey: 'nav.myActivities', to: TEACHER_PATHS.activities },
  settings: { labelKey: 'nav.settings', to: TEACHER_PATHS.settings },
} satisfies Record<string, SiteLink>
