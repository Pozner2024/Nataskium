import {
  type ActivityKind,
  libraryGroupsResponseSchema,
  libraryListResponseSchema,
  libraryTakeResponseSchema,
} from '@nataskium/shared/schemas'
import { apiRequest } from '@/shared'
import type { LibraryGroupsResponse, LibraryListResponse, LibraryTakeResponse } from './types'

// Сервер копирует картинки задания по одной, и это дольше обычного запроса: при обычных 15 с клиент показал бы
// «нет связи», а копия на сервере всё равно появилась бы
const TAKE_TIMEOUT_MS = 60_000

export type LibraryListParams = { group: string | null; q: string | null; page: number; type?: ActivityKind }

function listQuery({ group, q, page, type }: LibraryListParams): string {
  const params = new URLSearchParams({ page: String(page) })
  if (group !== null) params.set('group', group)
  if (q !== null) params.set('q', q)
  if (type !== undefined) params.set('type', type)
  return params.toString()
}

// Маршруты библиотеки /api/library/*: чтение публичное, «Взять себе» — только с токеном учителя.
// Игра задания библиотеки идёт через playApi (/api/library/play/<номер>)
export const libraryApi = {
  list: (params: LibraryListParams): Promise<LibraryListResponse> =>
    apiRequest(`/library?${listQuery(params)}`, libraryListResponseSchema, { method: 'GET' }),

  groups: (): Promise<LibraryGroupsResponse> => apiRequest('/library/groups', libraryGroupsResponseSchema, { method: 'GET' }),

  // Копия задания учителю: 201 с id копии; тела у запроса нет
  take: (number: number, accessToken: string): Promise<LibraryTakeResponse> =>
    apiRequest(`/library/${number}/take`, libraryTakeResponseSchema, { method: 'POST', accessToken, timeoutMs: TAKE_TIMEOUT_MS }),
}
