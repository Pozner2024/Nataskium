const TOKEN_PARAM = 'token'

type BrowserLocation = Pick<Location, 'hash' | 'pathname' | 'search'>
type BrowserHistory = Pick<History, 'state' | 'replaceState'>

// Токен из ссылки письма или редиректа: #token=… (фрагмент не уходит на сервер, в логи и Referer).
// Сразу убираем фрагмент из адреса, чтобы токен не остался в истории, закладках и при копировании ссылки
export function takeTokenFromHash(
  location: BrowserLocation = window.location,
  history: BrowserHistory = window.history,
): string | null {
  const token = new URLSearchParams(location.hash.slice(1)).get(TOKEN_PARAM)
  if (location.hash !== '') history.replaceState(history.state, '', `${location.pathname}${location.search}`)
  return token === null || token === '' ? null : token
}
