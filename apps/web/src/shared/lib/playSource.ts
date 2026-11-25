import { libraryNumberSchema, shareTokenSchema } from '@nataskium/shared/schemas'

// Откуда игра берёт задание: по ссылке учителя (shareToken) или из библиотеки по публичному номеру.
// shareToken заданий библиотеки клиенту не отдаётся: сервер находит его по номеру сам
export type PlaySource = { kind: 'share'; token: string } | { kind: 'library'; number: number }

// Путь маршрутов игры без префикса /api; токен экранируется, чтобы не выйти за пределы /play
export function playApiPath(source: PlaySource): string {
  if (source.kind === 'share') return `/play/${encodeURIComponent(source.token)}`
  return `/library/play/${source.number}`
}

export function isPlaySourceValid(source: PlaySource | null): source is PlaySource {
  if (source === null) return false
  if (source.kind === 'share') return shareTokenSchema.safeParse(source.token).success
  return libraryNumberSchema.safeParse(source.number).success
}
