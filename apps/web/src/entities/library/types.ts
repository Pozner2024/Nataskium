import type { LibraryQuizResponse } from '@nataskium/shared/schemas'

export type {
  LibraryGroup,
  LibraryGroupsResponse,
  LibraryListItem,
  LibraryListResponse,
  LibraryQuizResponse,
  LibraryQuizSummary,
  LibraryTakeResponse,
  LibraryThumbnail,
} from '@nataskium/shared/schemas'

// Карточка задания любого типа: сводка и содержимое без правильных ответов
export type LibraryQuizDetails = LibraryQuizResponse['quiz']

// Карточка викторины: первые вопросы без правильных ответов
export type LibraryQuizCard = Extract<LibraryQuizDetails, { type: 'quiz' }>

// Группа с названием на текущем языке сайта
export type NamedLibraryGroup = { slug: string; name: string }
