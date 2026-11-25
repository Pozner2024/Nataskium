export type {
  LibraryGroup,
  LibraryGroupsResponse,
  LibraryListItem,
  LibraryListResponse,
  LibraryQuizSummary,
  LibraryTakeResponse,
  LibraryThumbnail,
} from '@nataskium/shared/schemas'

// Группа с названием на текущем языке сайта
export type NamedLibraryGroup = { slug: string; name: string }
