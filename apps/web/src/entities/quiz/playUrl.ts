export const PREVIEW_QUERY_KEY = 'preview'
export const PREVIEW_QUERY = `${PREVIEW_QUERY_KEY}=1`

// Ссылка ученика без языкового префикса: язык игры ученик получает по браузеру
export function playUrl(shareToken: string): string {
  return `${window.location.origin}/play/${encodeURIComponent(shareToken)}`
}
