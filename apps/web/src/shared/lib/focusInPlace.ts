// Фокус без рывка страницы. По умолчанию браузер центрирует элемент и двигает все прокручиваемые предки,
// включая окно: игра в проигрывателе уводила бы шапку сайта. Здесь листается только то, что нужно, чтобы элемент был виден
export function focusInPlace(element: HTMLElement | null | undefined): void {
  if (!element) return
  element.focus({ preventScroll: true })
  if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'nearest' })
}
