import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { LIBRARY_VIEW_STORAGE_KEY, useLibraryView } from './useLibraryView'

let view: ReturnType<typeof useLibraryView>

const Host = defineComponent({
  setup() {
    view = useLibraryView()
    return () => h('div')
  },
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('useLibraryView', () => {
  it('по умолчанию — плиткой', async () => {
    await mountSuspended(Host)
    expect(view.view.value).toBe('tiles')
  })

  it('сохранённый выбор «списком» восстанавливается', async () => {
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, 'list')
    await mountSuspended(Host)
    expect(view.view.value).toBe('list')
  })

  it('мусор в хранилище — плиткой', async () => {
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, 'grid')
    await mountSuspended(Host)
    expect(view.view.value).toBe('tiles')
  })

  it('setView запоминает выбор', async () => {
    await mountSuspended(Host)
    view.setView('list')
    expect(view.view.value).toBe('list')
    expect(localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY)).toBe('list')
  })

  it('хранилище недоступно — без ошибки: плиткой, переключение работает в памяти', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    await mountSuspended(Host)
    expect(view.view.value).toBe('tiles')
    view.setView('list')
    expect(view.view.value).toBe('list')
  })
})
