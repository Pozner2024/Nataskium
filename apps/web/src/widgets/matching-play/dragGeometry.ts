import type { DropTarget, Point } from './types'

export type Rect = { top: number; right: number; bottom: number; left: number }

function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}

// Палец дрогнул — ещё не перетаскивание: иначе каждый тап по слову поднимал бы его
export function exceedsThreshold(start: Point, current: Point, threshold: number): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold
}

// Целью считается вся карточка определения. Лоток проверяется первым: карточки, уехавшие под липкий лоток,
// под пальцем не видны и целью быть не должны
export function hitTarget(point: Point, tray: Rect | null, definitions: readonly (Rect | null)[]): DropTarget | null {
  if (tray && contains(tray, point)) return { kind: 'tray' }
  const index = definitions.findIndex((rect) => rect !== null && contains(rect, point))
  return index === -1 ? null : { kind: 'definition', index }
}

// Сдвиг прокрутки за кадр: вверх — в полосе под нижней границей лотка, вниз — у нижнего края экрана; ближе к краю
// быстрее. Над самим лотком прокрутки нет: там слово возвращают к словам
export function autoScrollStep(y: number, zone: { top: number; bottom: number }, edge: number, maxStep: number): number {
  if (y < zone.top) return 0
  if (y < zone.top + edge) return -Math.ceil(maxStep * ((zone.top + edge - y) / edge))
  if (y > zone.bottom - edge) return Math.ceil(maxStep * Math.min(1, (y - (zone.bottom - edge)) / edge))
  return 0
}
