import {
  libraryGroupsResponseSchema,
  libraryListResponseSchema,
  libraryQuizResponseSchema,
  libraryTakeResponseSchema,
} from '@nataskium/shared/schemas'
import { apiRequest } from '@/shared'
import type { LibraryGroupsResponse, LibraryListResponse, LibraryQuizResponse, LibraryTakeResponse } from './types'

// Сервер копирует картинки задания по одной, и это дольше обычного запроса: при обычных 15 с клиент показал бы
// «нет связи», а копия на сервере всё равно появилась бы
const TAKE_TIMEOUT_MS = 60_000

export type LibraryListParams = { group: string | null; q: string | null; page: number }

function listQuery({ group, q, page }: LibraryListParams): string {
  const params = new URLSearchParams({ page: String(page) })
  if (group !== null) params.set('group', group)
  if (q !== null) params.set('q', q)
  return params.toString()
}

// Маршруты библиотеки /api/library/*: чтение публичное, «Взять себе» — только с токеном учителя
export const libraryApi = {
  list: (params: LibraryListParams): Promise<LibraryListResponse> =>
    apiRequest(`/library?${listQuery(params)}`, libraryListResponseSchema, { method: 'GET' }),

  groups: (): Promise<LibraryGroupsResponse> => apiRequest('/library/groups', libraryGroupsResponseSchema, { method: 'GET' }),

  // Карточка без правильных ответов; адрес строится из номера, а не из текста
  get: (number: number): Promise<LibraryQuizResponse> =>
    apiRequest(`/library/${number}`, libraryQuizResponseSchema, { method: 'GET' }),

  // Копия задания учителю: 201 с id копии; тела у запроса нет
  take: (number: number, accessToken: string): Promise<LibraryTakeResponse> =>
    apiRequest(`/library/${number}/take`, libraryTakeResponseSchema, { method: 'POST', accessToken, timeoutMs: TAKE_TIMEOUT_MS }),
}
