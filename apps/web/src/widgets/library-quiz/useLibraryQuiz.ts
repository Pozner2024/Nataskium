import { type Ref, ref } from 'vue'
import { type LibraryQuizDetails, libraryApi } from '@/entities/library'
import { ApiError } from '@/shared'

const NOT_FOUND_STATUS = 404

export type LibraryQuizStatus = 'loading' | 'ready' | 'notFound' | 'error'

// Карточка задания. Нет задания, удалено, скрыто, непубличное — для клиента одно и то же: notFound.
// Всё остальное (сеть, 429, 5xx, ответ не по схеме) — error с возможностью повторить
export function useLibraryQuiz(number: Ref<number>) {
  const quiz = ref<LibraryQuizDetails | null>(null)
  const status = ref<LibraryQuizStatus>('loading')
  // Ответ на устаревший запрос (номер успели сменить) не должен затереть свежий
  let requestId = 0

  async function load(): Promise<void> {
    const id = ++requestId
    status.value = 'loading'
    try {
      const response = await libraryApi.get(number.value)
      if (id !== requestId) return
      quiz.value = response.quiz
      status.value = 'ready'
    } catch (error) {
      if (id !== requestId) return
      quiz.value = null
      status.value = error instanceof ApiError && error.status === NOT_FOUND_STATUS ? 'notFound' : 'error'
    }
  }

  return { quiz, status, load }
}
