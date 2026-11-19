import type { TrueFalseRepository, StoredTrueFalse } from '../types'
import { trueFalseNotFound } from './trueFalseErrors'

export function makeGetTrueFalse(deps: { trueFalse: TrueFalseRepository }) {
  return async function getTrueFalse(teacherId: string, id: string): Promise<StoredTrueFalse> {
    const activity = await deps.trueFalse.findOwned(id, teacherId)
    if (activity === null) throw trueFalseNotFound()
    return activity
  }
}
