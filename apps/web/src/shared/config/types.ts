export interface SiteLink {
  label: string
  // Внутренняя страница, которая уже есть
  to?: string
  // Страница, которой ещё нет, внешняя ссылка или mailto: — обычная ссылка без проверки маршрута
  href?: string
}
