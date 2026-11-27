import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playApi } from '@/entities/quiz'
import { ApiError } from '@/shared'
import PlayPage from './PlayPage.vue'

const { showErrorMock } = vi.hoisted(() => ({ showErrorMock: vi.fn() }))
mockNuxtImport('showError', () => showErrorMock)

vi.mock('@/entities/quiz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/quiz')>()),
  playApi: { get: vi.fn(), check: vi.fn(), finish: vi.fn() },
}))

const NOT_FOUND_TEXT = 'Задание не найдено или удалено'

let wrapper: VueWrapper | undefined

async function mountLibrary(slug: string) {
  wrapper = await mountSuspended(PlayPage, { props: { address: { kind: 'library', slug } }, route: `/library/quiz/${slug}` })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['ru-RU'])
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

// Как у /play: не найденное задание библиотеки — сообщение внутри проигрывателя, а не страница 404 сайта
describe('PlayPage: задание библиотеки не найдено', () => {
  it('мусорный адрес: сообщение в проигрывателе, без запроса и без showError', async () => {
    const page = await mountLibrary('abc')

    expect(playApi.get).not.toHaveBeenCalled()
    expect(page.get('.play-page [role="alert"]').text()).toBe(NOT_FOUND_TEXT)
    expect(showErrorMock).not.toHaveBeenCalled()
  })

  it('снято, скрыто или удалено (404 API): сообщение в проигрывателе, без showError', async () => {
    vi.mocked(playApi.get).mockRejectedValue(new ApiError(404))
    const page = await mountLibrary('12-capitals')

    expect(page.get('.play-page [role="alert"]').text()).toBe(NOT_FOUND_TEXT)
    expect(page.find('.intro-player__start-button').exists()).toBe(false)
    expect(showErrorMock).not.toHaveBeenCalled()
  })
})
