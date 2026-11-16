import type { MatchingInput } from '@nataskium/shared/schemas'
import type { MatchingRepository, StoredMatching } from '../types'
import { matchingNotFound, unknownGroup } from './matchingErrors'

export function makeUpdateMatching(deps: { matchings: MatchingRepository }) {
  return async function updateMatching(teacherId: string, id: string, input: MatchingInput): Promise<StoredMatching> {
    if (!(await deps.matchings.groupExists(input.group))) throw unknownGroup()
    if (!(await deps.matchings.updateOwned(id, teacherId, input))) throw matchingNotFound()

    const matching = await deps.matchings.findOwned(id, teacherId)
    // Удалено между обновлением и чтением
    if (matching === null) throw matchingNotFound()
    return matching
  }
}
