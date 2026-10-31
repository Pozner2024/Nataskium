import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorPage from './ErrorPage.vue'

interface SeoMeta {
  title: () => string
  robots: string
}

const { useSeoMetaMock } = vi.hoisted(() => ({
  useSeoMetaMock: vi.fn<(meta: SeoMeta) => void>(),
}))

mockNuxtImport('useSeoMeta', () => useSeoMetaMock)

const NOT_FOUND_TITLE = 'Такой страницы нет'
const SERVER_ERROR_TITLE = 'Что-то пошло не так'

let wrapper: VueWrapper

async function mountPage(status?: number) {
  wrapper = await mountSuspended(ErrorPage, { props: { status } })
}

function seoMeta() {
  return useSeoMetaMock.mock.lastCall![0]
}

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('ErrorPage', () => {
  it('на 404 говорит, что страницы нет', async () => {
    await mountPage(404)

    expect(wrapper.find('.error-page__code').text()).toBe('404')
    expect(wrapper.find('h1').text()).toBe(NOT_FOUND_TITLE)
    expect(wrapper.find('.error-page__description').text()).toContain('ссылка устарела')
    expect(seoMeta().title()).toBe(NOT_FOUND_TITLE)
  })

  it.each([500, 502, 503])('на %i говорит о сбое', async (status) => {
    await mountPage(status)

    expect(wrapper.find('.error-page__code').text()).toBe(String(status))
    expect(wrapper.find('h1').text()).toBe(SERVER_ERROR_TITLE)
    expect(wrapper.find('.error-page__description').text()).toContain('Попробуйте зайти чуть позже')
    expect(seoMeta().title()).toBe(SERVER_ERROR_TITLE)
  })

  it('без кода не показывает пустую плашку', async () => {
    await mountPage()

    expect(wrapper.find('.error-page__code').exists()).toBe(false)
    expect(wrapper.find('h1').text()).toBe(SERVER_ERROR_TITLE)
  })

  it.each([404, 500])('на %i один заголовок h1 и запрет индексации', async (status) => {
    await mountPage(status)

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(seoMeta().robots).toContain('noindex')
  })

  it('кнопка — ссылка на главную', async () => {
    await mountPage(404)

    const button = wrapper.find('.app-button')
    expect(button.element.tagName).toBe('A')
    expect(button.attributes('href')).toBe('/')
  })
})
