import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNuxtState } from '#imports'
import { libraryApi } from '@/entities/library'
import LibraryGroupPage from './LibraryGroupPage.vue'

const GROUPS = [
  { slug: 'math', names: { ru: 'Математика', en: 'Math', de: 'Mathe', fr: 'Maths' } },
  { slug: 'geography', names: { ru: 'География', en: 'Geography', de: 'Geografie', fr: 'Géographie' } },
]

let wrapper: VueWrapper | null = null

beforeEach(() => {
  clearNuxtState('library-groups')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

describe('LibraryGroupPage', () => {
  it('сбой загрузки групп: показывает ошибку и кнопку повтора; повтор загружает группу и список', async () => {
    const groups = vi
      .spyOn(libraryApi, 'groups')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ groups: GROUPS })
    const list = vi.spyOn(libraryApi, 'list').mockResolvedValue({ quizzes: [], page: 1, hasNext: false })

    wrapper = await mountSuspended(LibraryGroupPage, { props: { group: 'math' } })
    await flushPromises()

    expect(wrapper.find('.library-group-page__error [role="alert"]').exists()).toBe(true)
    expect(list).not.toHaveBeenCalled()

    await wrapper.get('.library-group-page__retry').trigger('click')
    await flushPromises()

    expect(groups).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.library-group-page__error').exists()).toBe(false)
    expect(wrapper.get('h1').text()).toBe('Математика')
    expect(list).toHaveBeenCalledWith({ group: 'math', q: null, page: 1 })
  })

  it('неизвестный slug группы: «не найдено» без запроса списка заданий', async () => {
    vi.spyOn(libraryApi, 'groups').mockResolvedValue({ groups: GROUPS })
    const list = vi.spyOn(libraryApi, 'list').mockResolvedValue({ quizzes: [], page: 1, hasNext: false })

    wrapper = await mountSuspended(LibraryGroupPage, { props: { group: 'unknown' } })
    await flushPromises()

    expect(wrapper.find('.library-group-page__not-found').exists()).toBe(true)
    expect(list).not.toHaveBeenCalled()
  })

  it('смена пропса group перемонтирует LibraryBrowser и запрашивает новую группу', async () => {
    vi.spyOn(libraryApi, 'groups').mockResolvedValue({ groups: GROUPS })
    const list = vi.spyOn(libraryApi, 'list').mockResolvedValue({ quizzes: [], page: 1, hasNext: false })

    wrapper = await mountSuspended(LibraryGroupPage, { props: { group: 'math' } })
    await flushPromises()
    expect(list).toHaveBeenLastCalledWith({ group: 'math', q: null, page: 1 })

    await wrapper.setProps({ group: 'geography' })
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('География')
    expect(list).toHaveBeenLastCalledWith({ group: 'geography', q: null, page: 1 })
  })
})
