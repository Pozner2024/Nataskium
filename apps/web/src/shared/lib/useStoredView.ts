import { onMounted, ref } from 'vue'

export type ListView = 'tiles' | 'list'

const DEFAULT_VIEW: ListView = 'tiles'

function isListView(value: unknown): value is ListView {
  return value === 'tiles' || value === 'list'
}

// Вид списка (плиткой или списком) запоминается в браузере под своим ключом. Хранилище читается после монтирования
// (на сервере его нет); недоступное хранилище (приватный режим, запрет cookie) не ломает переключение — выбор живёт до перезагрузки
export function useStoredView(storageKey: string) {
  const view = ref<ListView>(DEFAULT_VIEW)

  onMounted(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (isListView(stored)) view.value = stored
    } catch {
      // Остаётся вид по умолчанию
    }
  })

  function setView(next: ListView): void {
    view.value = next
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      // Выбор не сохранится после перезагрузки — не ошибка для пользователя
    }
  }

  return { view, setView }
}
