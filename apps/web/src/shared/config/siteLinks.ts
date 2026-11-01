import type { SiteLink } from './types'

// Страниц, кроме главной, пока нет: ссылки на будущие адреса идут через href, иначе роутер ругается
// на несуществующий маршрут. Когда страница появится — заменить href на to
export const SITE_LINKS = {
  home: { label: 'Главная', to: '/' },
  login: { label: 'Войти', href: '/login' },
  register: { label: 'Зарегистрироваться', href: '/register' },
  library: { label: 'Библиотека заданий', href: '/library' },
  pricing: { label: 'Тарифные планы', href: '/pricing' },
  faq: { label: 'Вопросы и ответы', href: '/faq' },
  help: { label: 'Центр помощи', href: '/help' },
  // Переключатель появится вместе с переводами сайта
  language: { label: 'Язык: Русский', href: '/language' },
} satisfies Record<string, SiteLink>
