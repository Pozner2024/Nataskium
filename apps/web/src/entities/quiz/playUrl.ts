// Ссылка ученика без языкового префикса: язык игры ученик получает по браузеру
export function playUrl(shareToken: string): string {
  return `${window.location.origin}/play/${encodeURIComponent(shareToken)}`
}
