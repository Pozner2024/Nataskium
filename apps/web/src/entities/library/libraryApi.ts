import { libraryGroupsResponseSchema, libraryListResponseSchema } from '@nataskium/shared/schemas'
import { apiRequest } from '@/shared'
import type { LibraryGroupsResponse, LibraryListResponse } from './types'

export type LibraryListParams = { group: string | null; q: string | null; page: number }

function listQuery({ group, q, page }: LibraryListParams): string {
  const params = new URLSearchParams({ page: String(page) })
  if (group !== null) params.set('group', group)
  if (q !== null) params.set('q', q)
  return params.toString()
}

// Публичные маршруты библиотеки /api/library/*: без авторизации
export const libraryApi = {
  list: (params: LibraryListParams): Promise<LibraryListResponse> =>
    apiRequest(`/library?${listQuery(params)}`, libraryListResponseSchema, { method: 'GET' }),

  groups: (): Promise<LibraryGroupsResponse> => apiRequest('/library/groups', libraryGroupsResponseSchema, { method: 'GET' }),
}
