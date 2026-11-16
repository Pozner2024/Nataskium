import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import { ApiError, NETWORK_ERROR_STATUS } from '@/shared'
import type { TakeStatus, TakenQuiz } from './types'

const UNAUTHORIZED_STATUS = 401
const NOT_FOUND_STATUS = 404
const LIMIT_STATUS = 409
const RATE_LIMIT_STATUS = 429
const STORAGE_STATUS = 503

// Состояние ошибки по статусу API; 401 сюда не попадает — его обрабатывает run
const ERROR_STATUS: Record<number, TakeStatus> = {
  [NOT_FOUND_STATUS]: 'notFound',
  [LIMIT_STATUS]: 'limit',
  [RATE_LIMIT_STATUS]: 'busy',
  [STORAGE_STATUS]: 'storage',
  [NETWORK_ERROR_STATUS]: 'network',
}

export type TakeLibraryQuizOptions = {
  isSignedIn: () => boolean
  // Копирование с токеном учителя: подставляет виджет, фича сама к авторизации не обращается
  take: () => Promise<TakenQuiz>
  onTaken: (quizId: string) => void
  onLoginRequired: () => void
}

function failureStatus(error: unknown): TakeStatus {
  if (!(error instanceof ApiError)) return 'failed'
  return ERROR_STATUS[error.status] ?? 'failed'
}

// «Взять себе»: гость получает просьбу войти, вошедший — копию. Повторный запуск во время копирования
// и после успеха игнорируется; после ошибки кнопка нажимается снова — это и есть повтор
export function useTakeLibraryQuiz(options: TakeLibraryQuizOptions) {
  const status = ref<TakeStatus>('idle')
  const isBusy = computed(() => status.value === 'taking' || status.value === 'taken')
  // Человек мог уйти со страницы, пока шло копирование: ответ придёт к уже убранному компоненту,
  // и переход в редактор посреди другой работы только помешал бы. Копия при этом создана
  let isDisposed = false
  if (getCurrentScope()) onScopeDispose(() => (isDisposed = true))

  async function run(): Promise<void> {
    // Проверка и установка статуса идут синхронно, до первого await: два быстрых нажатия не запустят два копирования
    if (isBusy.value) return
    if (!options.isSignedIn()) {
      options.onLoginRequired()
      return
    }
    status.value = 'taking'
    try {
      const { quizId } = await options.take()
      if (isDisposed) return
      status.value = 'taken'
      options.onTaken(quizId)
    } catch (error) {
      if (isDisposed) return
      if (error instanceof ApiError && error.status === UNAUTHORIZED_STATUS) {
        status.value = 'idle'
        options.onLoginRequired()
        return
      }
      status.value = failureStatus(error)
    }
  }

  return { status, isBusy, run }
}
