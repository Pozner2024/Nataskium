import { type ListView, useStoredView } from '@/shared'

export type LibraryView = ListView

export const LIBRARY_VIEW_STORAGE_KEY = 'nataskium.library-view'

export function useLibraryView() {
  return useStoredView(LIBRARY_VIEW_STORAGE_KEY)
}
