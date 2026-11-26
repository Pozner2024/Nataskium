import { type ActivityKind, LIBRARY_SEARCH_MIN_LENGTH } from '@nataskium/shared/schemas'
import { ref } from 'vue'
import { type LibraryListItem, libraryApi } from '@/entities/library'

export type BrowserStatus = 'loading' | 'ready' | 'error'

// Список раздела библиотеки или всех заданий одного типа: поиск сбрасывает список, «Показать ещё» дописывает следующую страницу
export function useLibraryBrowser(group: () => string | null, type: () => ActivityKind | undefined) {
  const search = ref('')
  const appliedSearch = ref<string | null>(null)
  const quizzes = ref<LibraryListItem[]>([])
  const page = ref(1)
  const hasNext = ref(false)
  const status = ref<BrowserStatus>('loading')
  const isLoadingMore = ref(false)
  const isMoreFailed = ref(false)
  const isSearchTooShort = ref(false)
  // Ответ на устаревший запрос (поиск успели сменить) не должен затереть свежий
  let requestId = 0

  function listParams(pageNumber: number): Parameters<typeof libraryApi.list>[0] {
    const kind = type()
    return { group: group(), q: appliedSearch.value, page: pageNumber, ...(kind === undefined ? {} : { type: kind }) }
  }

  async function reload(): Promise<void> {
    const id = ++requestId
    status.value = 'loading'
    isMoreFailed.value = false
    try {
      const response = await libraryApi.list(listParams(1))
      if (id !== requestId) return
      quizzes.value = response.quizzes
      page.value = response.page
      hasNext.value = response.hasNext
      status.value = 'ready'
    } catch {
      if (id === requestId) status.value = 'error'
    }
  }

  async function loadMore(): Promise<void> {
    if (isLoadingMore.value || !hasNext.value) return
    const id = requestId
    isLoadingMore.value = true
    isMoreFailed.value = false
    try {
      const response = await libraryApi.list(listParams(page.value + 1))
      if (id !== requestId) return
      quizzes.value.push(...response.quizzes)
      page.value = response.page
      hasNext.value = response.hasNext
    } catch {
      if (id === requestId) isMoreFailed.value = true
    } finally {
      isLoadingMore.value = false
    }
  }

  async function applySearch(): Promise<void> {
    const query = search.value.trim()
    isSearchTooShort.value = query.length > 0 && query.length < LIBRARY_SEARCH_MIN_LENGTH
    if (isSearchTooShort.value) return
    const next = query === '' ? null : query
    if (next === appliedSearch.value && status.value === 'ready') return
    appliedSearch.value = next
    await reload()
  }

  return {
    search,
    appliedSearch,
    quizzes,
    hasNext,
    status,
    isLoadingMore,
    isMoreFailed,
    isSearchTooShort,
    reload,
    loadMore,
    applySearch,
  }
}
