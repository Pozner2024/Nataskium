export type MatchingStatus = 'loading' | 'ready' | 'notFound' | 'changed' | 'failed'

// replaced — слово, которое стояло у определения и вернулось к словам
export type PlaceOutcome = { replaced: number | null }

// Куда отпущено слово: определение по индексу или лоток (вернуть к словам)
export type DropTarget = { kind: 'definition'; index: number } | { kind: 'tray' }

export type Point = { x: number; y: number }
