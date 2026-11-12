export interface SiteLink {
  // Ключ перевода подписи в src/shared/i18n/locales
  labelKey: string
  // Внутренняя страница, которая уже есть
  to?: string
  // Страница, которой ещё нет, внешняя ссылка или mailto: — обычная ссылка без проверки маршрута
  href?: string
}
