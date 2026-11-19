import type { TrueFalseRepository } from '../types'
import { trueFalseNotFound } from './trueFalseErrors'

// Мягкое удаление; физически строку удаляет общий purge через 30 дней
export function makeDeleteTrueFalse(deps: { trueFalse: TrueFalseRepository }) {
  return async function deleteTrueFalse(teacherId: string, id: string): Promise<void> {
    if (!(await deps.trueFalse.softDeleteOwned(id, teacherId))) throw trueFalseNotFound()
  }
}
