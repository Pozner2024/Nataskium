import type { LibraryQuizResponse } from '@nataskium/shared/schemas'

export type {
  LibraryGroup,
  LibraryGroupsResponse,
  LibraryListResponse,
  LibraryQuizResponse,
  LibraryQuizSummary,
  LibraryTakeResponse,
} from '@nataskium/shared/schemas'

// Карточка задания: сводка и первые вопросы без правильных ответов
export type LibraryQuizDetails = LibraryQuizResponse['quiz']

// Группа с названием на текущем языке сайта
export type NamedLibraryGroup = { slug: string; name: string }
