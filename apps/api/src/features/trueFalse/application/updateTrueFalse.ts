import type { TrueFalseInput } from '@nataskium/shared/schemas'
import type { TrueFalseRepository, StoredTrueFalse } from '../types'
import { trueFalseNotFound, unknownGroup } from './trueFalseErrors'

export function makeUpdateTrueFalse(deps: { trueFalse: TrueFalseRepository }) {
  return async function updateTrueFalse(teacherId: string, id: string, input: TrueFalseInput): Promise<StoredTrueFalse> {
    if (!(await deps.trueFalse.groupExists(input.group))) throw unknownGroup()
    if (!(await deps.trueFalse.updateOwned(id, teacherId, input))) throw trueFalseNotFound()

    const activity = await deps.trueFalse.findOwned(id, teacherId)
    // Удалено между обновлением и чтением
    if (activity === null) throw trueFalseNotFound()
    return activity
  }
}
