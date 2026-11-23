import { onMounted, ref } from 'vue'

export type LibraryView = 'tiles' | 'list'

export const LIBRARY_VIEW_STORAGE_KEY = 'nataskium.library-view'

const DEFAULT_VIEW: LibraryView = 'tiles'

function isLibraryView(value: unknown): value is LibraryView {
  return value === 'tiles' || value === 'list'
}

// Вид списка библиотеки запоминается в браузере. Хранилище читается после монтирования (на сервере его нет);
// недоступное хранилище (приватный режим, запрет cookie) не ломает переключение — выбор живёт до перезагрузки
export function useLibraryView() {
  const view = ref<LibraryView>(DEFAULT_VIEW)

  onMounted(() => {
    try {
      const stored = localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY)
      if (isLibraryView(stored)) view.value = stored
    } catch {
      // Остаётся вид по умолчанию
    }
  })

  function setView(next: LibraryView): void {
    view.value = next
    try {
      localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, next)
    } catch {
      // Выбор не сохранится после перезагрузки — не ошибка для пользователя
    }
  }

  return { view, setView }
}
