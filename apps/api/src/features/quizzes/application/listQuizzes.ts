import type { QuizSummary } from '@nataskium/shared/schemas'
import { type ImageUrl, toActivityThumbnail } from '../../../shared/application'
import type { QuizRepository } from '../types'

export function makeListQuizzes(deps: { quizzes: QuizRepository; imageUrl: ImageUrl }) {
  return async function listQuizzes(teacherId: string): Promise<QuizSummary[]> {
    const rows = await deps.quizzes.listByTeacher(teacherId)
    return rows.map(({ head, ...summary }) => ({ ...summary, thumbnail: toActivityThumbnail({ type: summary.type, head }, deps.imageUrl) }))
  }
}
