import type { TeacherRepository, TeacherView } from '../types'
import { sessionInvalid } from './authErrors'
import { toTeacherView } from './issueSession'

export type GetMeDeps = {
  teachers: TeacherRepository
}

export function makeGetMe(deps: GetMeDeps) {
  return async function getMe(teacherId: string): Promise<TeacherView> {
    const teacher = await deps.teachers.findById(teacherId)
    // Аккаунт удалён, а access-токен ещё жив: это конец сессии (401), а не «не найдено» (404)
    if (teacher === null) throw sessionInvalid()

    return toTeacherView(teacher)
  }
}
