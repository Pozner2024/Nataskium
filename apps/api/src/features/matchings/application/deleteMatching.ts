import type { MatchingRepository } from '../types'
import { matchingNotFound } from './matchingErrors'

// Мягкое удаление; физически строку удаляет общий purge через 30 дней
export function makeDeleteMatching(deps: { matchings: MatchingRepository }) {
  return async function deleteMatching(teacherId: string, id: string): Promise<void> {
    if (!(await deps.matchings.softDeleteOwned(id, teacherId))) throw matchingNotFound()
  }
}
