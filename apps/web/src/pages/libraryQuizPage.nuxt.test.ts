import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNuxtState, useRouter } from '#imports'
import { libraryApi } from '@/entities/library'
import { ApiError } from '@/shared'
import LibraryQuizPage from './LibraryQuizPage.vue'

const { showErrorMock } = vi.hoisted(() => ({ showErrorMock: vi.fn() }))
mockNuxtImport('showError', () => showErrorMock)

const NOT_FOUND = { statusCode: 404, status: 404, statusMessage: 'Not Found' }
const QUIZ_NUMBER = 12

const QUIZ_BODY = {
  quiz: {
    type: 'quiz' as const,
    number: QUIZ_NUMBER,
    title: 'Столицы',
    groupSlug: 'other',
    questionCount: 1,
    graded: false,
    createdAt: '2026-11-15T10:00:00.000Z',
    questions: [{ text: 'Вопрос', imageUrl: null, options: [{ text: 'Ответ', imageUrl: null }] }],
  },
}

let wrapper: VueWrapper

async function mountPage(slug: string) {
  wrapper = await mountSuspended(LibraryQuizPage, { props: { slug } })
  await flushPromises()
}

beforeEach(() => {
  clearNuxtState('library-groups')
  vi.spyOn(libraryApi, 'groups').mockResolvedValue({ groups: [] })
})

afterEach(async () => {
  wrapper.unmount()
  vi.restoreAllMocks()
  showErrorMock.mockReset()
  await useRouter().push('/')
})

describe('LibraryQuizPage', () => {
  it.each(['abc', '0', '-5', '012-x', '12abc'])('мусорный slug «%s» — 404 без запроса к API', async (slug) => {
    const get = vi.spyOn(libraryApi, 'get')
    await mountPage(slug)

    expect(showErrorMock).toHaveBeenCalledTimes(1)
    expect(showErrorMock).toHaveBeenCalledWith(NOT_FOUND)
    expect(get).not.toHaveBeenCalled()
    expect(wrapper.find('.library-quiz').exists()).toBe(false)
  })

  it('валидный slug 12-stolitsy запрашивает задание №12', async () => {
    const get = vi.spyOn(libraryApi, 'get').mockResolvedValue(QUIZ_BODY)
    await mountPage('12-stolitsy')

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(QUIZ_NUMBER)
    expect(showErrorMock).not.toHaveBeenCalled()
    expect(wrapper.find('h1').text()).toBe('Столицы')
  })

  it('slug из одного номера тоже валиден', async () => {
    const get = vi.spyOn(libraryApi, 'get').mockResolvedValue(QUIZ_BODY)
    await mountPage('12')

    expect(get).toHaveBeenCalledWith(QUIZ_NUMBER)
    expect(showErrorMock).not.toHaveBeenCalled()
  })

  it('404 от API — showError с 404', async () => {
    vi.spyOn(libraryApi, 'get').mockRejectedValue(new ApiError(404))
    await mountPage('12-stolitsy')

    expect(showErrorMock).toHaveBeenCalledTimes(1)
    expect(showErrorMock).toHaveBeenCalledWith(NOT_FOUND)
  })

  it('404 от API при кириллическом slug — тоже showError с 404', async () => {
    vi.spyOn(libraryApi, 'get').mockRejectedValue(new ApiError(404))
    await mountPage('12-столицы')

    expect(libraryApi.get).toHaveBeenCalledWith(QUIZ_NUMBER)
    expect(showErrorMock).toHaveBeenCalledWith(NOT_FOUND)
  })

  it('сбой сети или 5xx не превращается в 404', async () => {
    vi.spyOn(libraryApi, 'get').mockRejectedValue(new ApiError(500))
    await mountPage('12-stolitsy')

    expect(showErrorMock).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })
})
