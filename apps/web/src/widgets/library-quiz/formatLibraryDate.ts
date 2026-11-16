// Дата добавления на языке сайта; битая строка не должна ронять страницу — пустая дата просто не показывается
export function formatLibraryDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}
