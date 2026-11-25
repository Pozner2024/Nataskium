import { LIBRARY_PAGE_SIZE, type LibraryListQuery, type LibraryListResponse } from '@nataskium/shared/schemas'
import { toActivityThumbnail } from '../../../shared/application'
import type { LibraryImageUrl, LibraryRepository } from '../types'
import { libraryNotFound } from './libraryErrors'
import { toLibrarySummary } from './toLibrarySummary'

export function makeListLibraryQuizzes(deps: { library: LibraryRepository; imageUrl: LibraryImageUrl }) {
  return async function listLibraryQuizzes(query: LibraryListQuery): Promise<LibraryListResponse> {
    if (query.group !== undefined && !(await deps.library.groupExists(query.group))) throw libraryNotFound()
    // На одну строку больше страницы: по ней видно, есть ли следующая, без отдельного count
    const rows = await deps.library.list({
      group: query.group,
      q: query.q,
      offset: (query.page - 1) * LIBRARY_PAGE_SIZE,
      limit: LIBRARY_PAGE_SIZE + 1,
    })
    return {
      quizzes: rows.slice(0, LIBRARY_PAGE_SIZE).map((row) => ({
        ...toLibrarySummary(row, row.questionCount),
        introTheme: row.introTheme,
        thumbnail: toActivityThumbnail(row, deps.imageUrl),
      })),
      page: query.page,
      hasNext: rows.length > LIBRARY_PAGE_SIZE,
    }
  }
}
