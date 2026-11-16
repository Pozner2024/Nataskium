import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNuxtState, useRouter } from '#imports'
import { type LibraryListResponse, type LibraryQuizSummary, libraryApi } from '@/entities/library'
import { ApiError } from '@/shared'
import LibraryBrowser from './LibraryBrowser.vue'

const CREATED_AT = '2026-11-15T10:00:00.000Z'

const GROUPS = {
  groups: [{ slug: 'geography', names: { ru: 'География', en: 'Geography', de: 'Geografie', fr: 'Géographie' } }],
}

function summary(number: number, title: string, overrides: Partial<LibraryQuizSummary> = {}): LibraryQuizSummary {
  return { number, title, groupSlug: 'geography', questionCount: 3, graded: false, createdAt: CREATED_AT, ...overrides }
}

function listBody(quizzes: LibraryQuizSummary[], hasNext = false, page = 1): LibraryListResponse {
  return { quizzes, page, hasNext }
}

let wrapper: VueWrapper

async function mountBrowser(route?: string) {
  wrapper = await mountSuspended(LibraryBrowser, { props: { group: 'geography' }, route })
  await flushPromises()
}

function titleLinks() {
  return wrapper.findAll('.library-browser__title a')
}

beforeEach(() => {
  clearNuxtState('library-groups')
  vi.spyOn(libraryApi, 'groups').mockResolvedValue(GROUPS)
})

afterEach(async () => {
  wrapper.unmount()
  vi.restoreAllMocks()
  await useRouter().push('/')
})

describe('LibraryBrowser', () => {
  it('заголовок плитки — ссылка /library/quiz/<номер>-<slug>', async () => {
    vi.spyOn(libraryApi, 'list').mockResolvedValue(listBody([summary(12, 'World Capitals!'), summary(7, 'Fractions 2')]))
    await mountBrowser()

    expect(libraryApi.list).toHaveBeenCalledWith({ group: 'geography', q: null, page: 1 })
    expect(titleLinks().map((link) => [link.text(), link.attributes('href')])).toEqual([
      ['World Capitals!', '/library/quiz/12-world-capitals'],
      ['Fractions 2', '/library/quiz/7-fractions-2'],
    ])
  })

  it('на английском ссылка с префиксом /en', async () => {
    vi.spyOn(libraryApi, 'list').mockResolvedValue(listBody([summary(12, 'World Capitals')]))
    await mountBrowser('/en/library/geography')

    expect(titleLinks().map((link) => link.attributes('href'))).toEqual(['/en/library/quiz/12-world-capitals'])
  })

  it('кириллический заголовок даёт кириллический slug', async () => {
    vi.spyOn(libraryApi, 'list').mockResolvedValue(listBody([summary(5, 'Столицы Европы')]))
    await mountBrowser()

    const href = titleLinks()[0]!.attributes('href')!
    expect(decodeURIComponent(href)).toBe('/library/quiz/5-столицы-европы')
  })

  it('кириллический заголовок на английском сайте: префикс и кириллический slug', async () => {
    vi.spyOn(libraryApi, 'list').mockResolvedValue(listBody([summary(5, 'Столицы Европы')]))
    await mountBrowser('/en/library/geography')

    expect(decodeURIComponent(titleLinks()[0]!.attributes('href')!)).toBe('/en/library/quiz/5-столицы-европы')
  })

  it('заголовок без букв и цифр даёт запасной slug, но номер остаётся', async () => {
    vi.spyOn(libraryApi, 'list').mockResolvedValue(listBody([summary(9, '!!!')]))
    await mountBrowser()

    expect(titleLinks()[0]!.attributes('href')).toBe('/library/quiz/9-quiz')
  })

  it('в плитке — группа, число вопросов и оценивание', async () => {
    vi.spyOn(libraryApi, 'list').mockResolvedValue(listBody([summary(1, 'Столицы', { graded: true })]))
    await mountBrowser()

    expect(wrapper.find('.library-browser__meta').text()).toBe('География · Вопросов: 3')
    expect(wrapper.find('.library-browser__grade').text()).toBe('С оценкой')
  })

  it('пустой раздел — сообщение, без списка', async () => {
    vi.spyOn(libraryApi, 'list').mockResolvedValue(listBody([]))
    await mountBrowser()

    expect(wrapper.find('.library-browser__list').exists()).toBe(false)
    expect(wrapper.find('.library-browser__empty').text()).toBe('В этом разделе пока нет заданий')
  })

  it('ошибка — сообщение с role="alert", «Повторить» грузит заново', async () => {
    const list = vi.spyOn(libraryApi, 'list').mockRejectedValueOnce(new ApiError(500))
    await mountBrowser()

    expect(wrapper.find('.library-browser__error [role="alert"]').text()).toBe('Не получилось загрузить задания')
    list.mockResolvedValue(listBody([summary(12, 'Столицы')]))
    await wrapper.find('.library-browser__error button').trigger('click')
    await flushPromises()

    expect(list).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.library-browser__error').exists()).toBe(false)
    expect(titleLinks()).toHaveLength(1)
  })

  it('«Показать ещё» дописывает следующую страницу, ссылки есть у всех плиток', async () => {
    const list = vi
      .spyOn(libraryApi, 'list')
      .mockResolvedValueOnce(listBody([summary(12, 'Столицы')], true))
      .mockResolvedValueOnce(listBody([summary(7, 'Реки')], false, 2))
    await mountBrowser()
    const more = wrapper.findAll('button').find((button) => button.text() === 'Показать ещё')!

    await more.trigger('click')
    await flushPromises()

    expect(list).toHaveBeenLastCalledWith({ group: 'geography', q: null, page: 2 })
    expect(titleLinks().map((link) => decodeURIComponent(link.attributes('href')!))).toEqual([
      '/library/quiz/12-столицы',
      '/library/quiz/7-реки',
    ])
    expect(wrapper.findAll('button').some((button) => button.text() === 'Показать ещё')).toBe(false)
  })

  it('без следующей страницы кнопки «Показать ещё» нет', async () => {
    vi.spyOn(libraryApi, 'list').mockResolvedValue(listBody([summary(12, 'Столицы')]))
    await mountBrowser()

    expect(wrapper.text()).not.toContain('Показать ещё')
  })

  it('ошибка «Показать ещё» оставляет уже загруженные плитки', async () => {
    vi.spyOn(libraryApi, 'list')
      .mockResolvedValueOnce(listBody([summary(12, 'Столицы')], true))
      .mockRejectedValueOnce(new ApiError(429))
    await mountBrowser()

    await wrapper.findAll('button').find((button) => button.text() === 'Показать ещё')!.trigger('click')
    await flushPromises()

    expect(titleLinks()).toHaveLength(1)
    expect(wrapper.find('.library-browser__hint[role="alert"]').text()).toBe('Не получилось загрузить задания')
  })

  it('HTML в названии выводится текстом', async () => {
    const payload = '<b>жир</b>'
    vi.spyOn(libraryApi, 'list').mockResolvedValue(listBody([summary(3, payload)]))
    await mountBrowser()

    expect(titleLinks()[0]!.text()).toBe(payload)
    expect(wrapper.find('.library-browser__title b').exists()).toBe(false)
  })
})
