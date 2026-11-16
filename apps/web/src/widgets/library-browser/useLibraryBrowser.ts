import { LIBRARY_SEARCH_MIN_LENGTH } from '@nataskium/shared/schemas'
import { type Ref, ref } from 'vue'
import { type LibraryQuizSummary, libraryApi } from '@/entities/library'

export type BrowserStatus = 'loading' | 'ready' | 'error'

// Список раздела библиотеки: поиск сбрасывает список, «Показать ещё» дописывает следующую страницу
export function useLibraryBrowser(group: Ref<string>) {
  const search = ref('')
  const appliedSearch = ref<string | null>(null)
  const quizzes = ref<LibraryQuizSummary[]>([])
  const page = ref(1)
  const hasNext = ref(false)
  const status = ref<BrowserStatus>('loading')
  const isLoadingMore = ref(false)
  const isMoreFailed = ref(false)
  const isSearchTooShort = ref(false)
  // Ответ на устаревший запрос (поиск успели сменить) не должен затереть свежий
  let requestId = 0

  async function reload(): Promise<void> {
    const id = ++requestId
    status.value = 'loading'
    isMoreFailed.value = false
    try {
      const response = await libraryApi.list({ group: group.value, q: appliedSearch.value, page: 1 })
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
      const response = await libraryApi.list({ group: group.value, q: appliedSearch.value, page: page.value + 1 })
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
