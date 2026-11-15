import { slugifyTitle } from '../library'

// Страницы публичной библиотеки, без языкового префикса
export const LIBRARY_PAGE_PATHS = {
  root: '/library',
  // К адресу добавляется /<slug группы>
  group: '/library',
  // К адресу добавляется /<номер>-<slug>
  quiz: '/library/quiz',
} as const

export function libraryGroupPath(groupSlug: string): string {
  return `${LIBRARY_PAGE_PATHS.group}/${groupSlug}`
}

export function libraryQuizPath(number: number, title: string): string {
  return `${LIBRARY_PAGE_PATHS.quiz}/${number}-${slugifyTitle(title)}`
}
