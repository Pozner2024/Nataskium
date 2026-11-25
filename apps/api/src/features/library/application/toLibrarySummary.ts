import type { LibraryQuizSummary } from '@nataskium/shared/schemas'
import type { LibraryQuizMeta } from '../types'

export function toLibrarySummary(row: LibraryQuizMeta, questionCount: number): LibraryQuizSummary {
  return {
    number: row.number,
    type: row.type,
    title: row.title,
    groupSlug: row.groupSlug,
    questionCount,
    graded: row.graded,
    createdAt: row.createdAt.toISOString(),
  }
}
