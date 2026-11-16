import type { MatchingRepository, StoredMatching } from '../types'
import { matchingNotFound } from './matchingErrors'

export function makeGetMatching(deps: { matchings: MatchingRepository }) {
  return async function getMatching(teacherId: string, id: string): Promise<StoredMatching> {
    const matching = await deps.matchings.findOwned(id, teacherId)
    if (matching === null) throw matchingNotFound()
    return matching
  }
}
